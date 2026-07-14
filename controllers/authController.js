const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const db = require("../db/db-connection");
const { transferTokens } = require("../services/tokenServices");
const { incrementReferralCount } = require("../services/leaderBoardService");
const {
  uploadBufferToCloudinary,
  deleteFromCloudinary,
} = require("../services/cloudinaryService");
const { sendOtpEmail } = require("../services/emailServices");
const { getInt } = require("../services/configService");

const {
  user: User,
  wallet: Wallet,
  referral: Referral,
  otp: Otp,
  token_transaction: TokenTransaction,
  sequelize,
} = db;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateReferralCode = async () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code, exists;
  do {
    code = Array.from({ length: 8 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
    exists = await User.findOne({ where: { referral_code: code } });
  } while (exists);
  return code;
};

// Never expose password — returns both wallet balances when wallet is provided
const safeUser = (user, wallet = null) => ({
  id: user.id,
  full_name: user.full_name,
  username: user.username,
  email: user.email,
  mobile: user.mobile,
  profile_image: user.profile_image,
  referral_code: user.referral_code,
  role: user.role,
  status: user.status,
  is_email_verified: user.is_email_verified,
  created_at: user.created_at,
  ...(wallet !== null && {
    referral_token_balance: wallet.referral_token_balance ?? 0,
    shopping_token_balance: wallet.shopping_token_balance ?? 0,
  }),
});

// ─── SEND OTP ─────────────────────────────────────────────────────────────────

exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser && existingUser.is_email_verified) {
      return res.status(409).json({ message: "Email already registered" });
    }

    await Otp.update({ is_used: true }, { where: { email, is_used: false } });

    const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000);

    await Otp.create({ email, otp_code, expires_at });
    await sendOtpEmail(email, otp_code);

    return res.status(200).json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("[sendOtp]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── VERIFY OTP ───────────────────────────────────────────────────────────────

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp_code } = req.body;

    if (!email || !otp_code) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const otpRecord = await Otp.findOne({
      where: {
        email,
        otp_code,
        is_used: false,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [["created_at", "DESC"]],
    });

    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    await otpRecord.update({ is_used: true });

    return res.status(200).json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error("[verifyOtp]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── USER REGISTER ────────────────────────────────────────────────────────────

exports.register = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { full_name, username, email, mobile, password, referred_by_code } =
      req.body;

    if (!full_name || !username || !email || !mobile || !password) {
      await t.rollback();
      return res.status(400).json({ message: "All fields are required" });
    }

    const verifiedOtp = await Otp.findOne({
      where: { email, is_used: true },
      order: [["created_at", "DESC"]],
    });
    if (!verifiedOtp) {
      await t.rollback();
      return res.status(400).json({ message: "Email OTP not verified" });
    }

    const duplicate = await User.findOne({
      where: { [Op.or]: [{ email }, { mobile }, { username }] },
    });
    if (duplicate) {
      await t.rollback();
      const field =
        duplicate.email === email
          ? "Email"
          : duplicate.mobile === mobile
            ? "Mobile"
            : "Username";
      return res.status(409).json({ message: `${field} already in use` });
    }

    let referrer = null;
    if (referred_by_code) {
      referrer = await User.findOne({
        where: { referral_code: referred_by_code },
      });
      if (!referrer) {
        await t.rollback();
        return res.status(400).json({ message: "Invalid referral code" });
      }
      if (referrer.email === email || referrer.mobile === mobile) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "Cannot use your own referral code" });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const referral_code = await generateReferralCode();

    const newUser = await User.create(
      {
        full_name,
        username,
        email,
        mobile,
        password: hashedPassword,
        referral_code,
        referred_by_code: referred_by_code || null,
        referred_by: referrer ? referrer.id : null,
        is_email_verified: true,
        role: "user",
      },
      { transaction: t }
    );

    await Wallet.create(
      {
        user_id: newUser.id,
        referral_token_balance: 0,
        shopping_token_balance: 0,
      },
      { transaction: t }
    );

    const SIGNUP_BONUS   = await getInt("signup_bonus",   100);
    const { wallet: updatedWallet } = await transferTokens({
      user_id: newUser.id,
      wallet_type: "referral",
      type: "credit",
      source: "signup_bonus",
      tokens: SIGNUP_BONUS,
      remarks: "Welcome bonus on registration",
      transaction: t,
    });

    await newUser.update({ signup_bonus_credited: true }, { transaction: t });

    if (referrer) {
      const REFERRER_BONUS = await getInt("referrer_bonus", 200);
      const REFERRED_BONUS = await getInt("referred_bonus", 100);

      const referralRecord = await Referral.create(
        {
          referrer_id: referrer.id,
          referred_user_id: newUser.id,
          referral_code_used: referred_by_code,
          referrer_bonus: REFERRER_BONUS,
          referred_bonus: REFERRED_BONUS,
          referrer_bonus_credited: false,
          referred_bonus_credited: false,
          status: "pending",
        },
        { transaction: t }
      );

      await transferTokens({
        user_id: newUser.id,
        wallet_type: "referral",
        type: "credit",
        source: "referral_bonus_referred",
        tokens: REFERRED_BONUS,
        reference_id: referralRecord.id,
        remarks: `Referral bonus for joining via ${referred_by_code}`,
        transaction: t,
      });

      await referralRecord.update(
        { referred_bonus_credited: true },
        { transaction: t }
      );

      await transferTokens({
        user_id: referrer.id,
        wallet_type: "referral",
        type: "credit",
        source: "referral_bonus_referrer",
        tokens: REFERRER_BONUS,
        reference_id: referralRecord.id,
        remarks: `Referral bonus for inviting ${newUser.username}`,
        transaction: t,
      });

      await referralRecord.update(
        { referrer_bonus_credited: true, status: "completed" },
        { transaction: t }
      );

      await incrementReferralCount(referrer.id, t);
    }

    await t.commit();

    const token = jwt.sign(
      { id: newUser.id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      message: "Registration successful",
      token,
      user: safeUser(newUser, updatedWallet),
    });
  } catch (err) {
    await t.rollback();
    console.error("[register]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── ADMIN CREATE USER ────────────────────────────────────────────────────────

exports.adminCreateUser = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      full_name,
      username,
      email,
      mobile,
      password,
      role = "user",
    } = req.body;

    if (!full_name || !username || !email || !mobile || !password) {
      await t.rollback();
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!["user", "admin"].includes(role)) {
      await t.rollback();
      return res.status(400).json({ message: "Invalid role" });
    }

    const duplicate = await User.findOne({
      where: { [Op.or]: [{ email }, { mobile }, { username }] },
    });
    if (duplicate) {
      await t.rollback();
      const field =
        duplicate.email === email
          ? "Email"
          : duplicate.mobile === mobile
            ? "Mobile"
            : "Username";
      return res.status(409).json({ message: `${field} already in use` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const referral_code = await generateReferralCode();

    const newUser = await User.create(
      {
        full_name,
        username,
        email,
        mobile,
        password: hashedPassword,
        referral_code,
        is_email_verified: true,
        signup_bonus_credited: true,
        role,
        status: "active",
      },
      { transaction: t }
    );

    await Wallet.create(
      {
        user_id: newUser.id,
        referral_token_balance: 0,
        shopping_token_balance: 0,
      },
      { transaction: t }
    );

    await t.commit();

    return res.status(201).json({
      message: "User created successfully",
      user: safeUser(newUser, {
        referral_token_balance: 0,
        shopping_token_balance: 0,
      }),
    });
  } catch (err) {
    await t.rollback();
    console.error("[adminCreateUser]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────

exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res
        .status(400)
        .json({ message: "Identifier and password are required" });
    }

    const user = await User.findOne({
      where: { [Op.or]: [{ email: identifier }, { mobile: identifier }] },
      include: [{ model: Wallet, as: "wallet" }],
    });

    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.status === "blocked")
      return res.status(403).json({ message: "Account is blocked" });
    if (!user.is_email_verified)
      return res.status(403).json({ message: "Email not verified" });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch)
      return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: safeUser(user, user.wallet),
    });
  } catch (err) {
    console.error("[login]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── GET ALL USERS (Admin) ────────────────────────────────────────────────────

exports.getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      status,
      sort = "created_at",
      order = "DESC",
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (search) {
      where[Op.or] = [
        { full_name: { [Op.like]: `%${search}%` } },
        { username: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { mobile: { [Op.like]: `%${search}%` } },
      ];
    }

    if (role) where.role = role;
    if (status) where.status = status;

    const allowedSort = ["created_at", "full_name", "username", "email"];
    const sortColumn = allowedSort.includes(sort) ? sort : "created_at";
    const sortOrder = order.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { count, rows } = await User.findAndCountAll({
      where,
      order: [[sortColumn, sortOrder]],
      limit: parseInt(limit),
      offset,
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Wallet,
          as: "wallet",
          attributes: ["referral_token_balance", "shopping_token_balance"],
        },
      ],
    });

    return res.status(200).json({
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("[getAllUsers]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── GET SINGLE USER ──────────────────────────────────────────────────────────

exports.getUserById = async (req, res) => {
  try {
    const id = req.params.id || req.user.id;

    const user = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Wallet,
          as: "wallet",
          attributes: ["referral_token_balance", "shopping_token_balance"],
        },
      ],
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ data: user });
  } catch (err) {
    console.error("[getUserById]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── UPDATE USER (self) ───────────────────────────────────────────────────────

exports.updateMe = async (req, res) => {
  let uploadedImage = null;

  try {
    if (req.file) {
      uploadedImage = await uploadBufferToCloudinary(req.file.buffer, "profiles");
    }

    const t = await sequelize.transaction();
    try {
      const user_id = req.user.id;
      const { full_name, username, email } = req.body;

      const user = await User.findByPk(user_id, { transaction: t });
      if (!user) {
        await t.rollback();
        if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
        return res.status(404).json({ message: "User not found" });
      }

      if (username && username !== user.username) {
        const exists = await User.findOne({ where: { username }, transaction: t });
        if (exists) {
          await t.rollback();
          if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
          return res.status(409).json({ message: "Username already in use" });
        }
      }

      if (email && email !== user.email) {
        const exists = await User.findOne({ where: { email }, transaction: t });
        if (exists) {
          await t.rollback();
          if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
          return res.status(409).json({ message: "Email already in use" });
        }
      }

      const updates = {};
      if (full_name)     updates.full_name                 = full_name;
      if (username)      updates.username                  = username;
      if (email)         updates.email                     = email;
      if (uploadedImage) {
        updates.profile_image           = uploadedImage.secure_url;
        updates.profile_image_public_id = uploadedImage.public_id;
      }

      if (!Object.keys(updates).length) {
        await t.rollback();
        if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
        return res.status(400).json({ message: "No valid fields provided" });
      }

      const oldPublicId = uploadedImage ? user.profile_image_public_id : null;

      await user.update(updates, { transaction: t });
      await t.commit();

      if (oldPublicId) await deleteFromCloudinary(oldPublicId);

      return res.status(200).json({
        message: "Profile updated successfully",
        user: safeUser(user),
      });
    } catch (err) {
      await t.rollback();
      if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
      throw err;
    }
  } catch (err) {
    console.error("[updateMe]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── UPDATE USER (Admin) ──────────────────────────────────────────────────────

exports.adminUpdateUser = async (req, res) => {
  let uploadedImage = null;

  try {
    if (req.file) {
      uploadedImage = await uploadBufferToCloudinary(req.file.buffer, "profiles");
    }

    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { full_name, username, email, role, status } = req.body;

      const user = await User.findByPk(id, { transaction: t });
      if (!user) {
        await t.rollback();
        if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
        return res.status(404).json({ message: "User not found" });
      }

      if (username && username !== user.username) {
        const exists = await User.findOne({ where: { username }, transaction: t });
        if (exists) {
          await t.rollback();
          if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
          return res.status(409).json({ message: "Username already in use" });
        }
      }

      if (email && email !== user.email) {
        const exists = await User.findOne({ where: { email }, transaction: t });
        if (exists) {
          await t.rollback();
          if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
          return res.status(409).json({ message: "Email already in use" });
        }
      }

      if (role && !["user", "admin"].includes(role)) {
        await t.rollback();
        if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
        return res.status(400).json({ message: "Invalid role" });
      }

      if (status && !["active", "blocked"].includes(status)) {
        await t.rollback();
        if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
        return res.status(400).json({ message: "Invalid status" });
      }

      const updates = {};
      if (full_name)     updates.full_name                 = full_name;
      if (username)      updates.username                  = username;
      if (email)         updates.email                     = email;
      if (role)          updates.role                      = role;
      if (status)        updates.status                    = status;
      if (uploadedImage) {
        updates.profile_image           = uploadedImage.secure_url;
        updates.profile_image_public_id = uploadedImage.public_id;
      }

      if (!Object.keys(updates).length) {
        await t.rollback();
        if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
        return res.status(400).json({ message: "No valid fields provided" });
      }

      const oldPublicId = uploadedImage ? user.profile_image_public_id : null;

      await user.update(updates, { transaction: t });
      await t.commit();

      if (oldPublicId) await deleteFromCloudinary(oldPublicId);

      return res.status(200).json({
        message: "User updated successfully",
        user: safeUser(user),
      });
    } catch (err) {
      await t.rollback();
      if (uploadedImage) await deleteFromCloudinary(uploadedImage.public_id);
      throw err;
    }
  } catch (err) {
    console.error("[adminUpdateUser]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── DELETE USER (Admin) ──────────────────────────────────────────────────────

exports.adminDeleteUser = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
      await t.rollback();
      return res.status(400).json({ message: "Cannot delete your own account" });
    }

    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    await user.destroy({ transaction: t });
    await t.commit();

    if (user.profile_public_id) {
      await deleteFromCloudinary(user.profile_public_id);
    }

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    await t.rollback();
    console.error("[adminDeleteUser]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(200).json({
        message: "If this email is registered, an OTP has been sent",
      });
    }

    await Otp.update({ is_used: true }, { where: { email, is_used: false } });

    const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000);

    await Otp.create({ email, otp_code, expires_at });
    await sendOtpEmail(email, otp_code);

    return res.status(200).json({
      message: "If this email is registered, an OTP has been sent",
    });
  } catch (err) {
    console.error("[forgotPassword]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── VERIFY FORGOT OTP ────────────────────────────────────────────────────────

exports.verifyForgotOtp = async (req, res) => {
  try {
    const { email, otp_code } = req.body;

    if (!email || !otp_code) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const otpRecord = await Otp.findOne({
      where: {
        email,
        otp_code,
        is_used: false,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [["created_at", "DESC"]],
    });

    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    await otpRecord.update({ is_used: true });

    return res.status(200).json({ message: "OTP verified. Proceed to reset password." });
  } catch (err) {
    console.error("[verifyForgotOtp]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────

exports.resetPassword = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { email, new_password } = req.body;

    if (!email || !new_password) {
      await t.rollback();
      return res.status(400).json({ message: "Email and new password are required" });
    }

    if (new_password.length < 6) {
      await t.rollback();
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const verifiedOtp = await Otp.findOne({
      where: { email, is_used: true },
      order: [["updated_at", "DESC"]],
    });

    if (!verifiedOtp) {
      await t.rollback();
      return res.status(400).json({ message: "OTP not verified for this email" });
    }

    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (verifiedOtp.updated_at < fifteenMinsAgo) {
      await t.rollback();
      return res.status(400).json({ message: "OTP session expired. Please request a new OTP." });
    }

    const user = await User.findOne({ where: { email }, transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await user.update({ password: hashedPassword }, { transaction: t });

    await t.commit();

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (err) {
    await t.rollback();
    console.error("[resetPassword]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── GET RECENT USERS ─────────────────────────────────────────────────────────

exports.getRecentUsers = async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const users = await User.findAll({
      where: { status: "active", is_email_verified: true },
      order: [["created_at", "DESC"]],
      limit: Math.min(parseInt(limit), 50),
      attributes: ["id", "username", "full_name", "created_at"],
    });

    return res.status(200).json({ data: users });
  } catch (err) {
    console.error("[getRecentUsers]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── GET MY TRANSACTIONS ──────────────────────────────────────────────────────

exports.getMyTransactions = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { page = 1, limit = 20, wallet_type, type } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = { user_id };

    if (wallet_type && ["referral", "shopping"].includes(wallet_type)) {
      where.wallet_type = wallet_type;
    }

    if (type && ["credit", "debit"].includes(type)) {
      where.type = type;
    }

    const { count, rows } = await db.token_transaction.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit: Math.min(parseInt(limit), 50),
      offset,
      attributes: [
        "id", "wallet_type", "type", "source",
        "tokens", "balance_after", "remarks", "created_at",
      ],
    });

    return res.status(200).json({
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("[getMyTransactions]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};