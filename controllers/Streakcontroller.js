const db = require("../db/db-connection");
const { transferTokens } = require("../services/tokenServices");
const { getInt } = require("../services/configService");

const { user: User, sequelize } = db;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns 'YYYY-MM-DD' pinned to IST (UTC+5:30), regardless of server timezone.
// This matters because your users are in India — using raw UTC would flip
// the "day" boundary 5.5 hours early/late relative to their actual midnight.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const todayDateOnly = () => {
  const now = new Date();
  const istShifted = new Date(now.getTime() + IST_OFFSET_MS);
  return istShifted.toISOString().slice(0, 10);
};

const daysBetween = (a, b) => {
  const msPerDay = 24 * 60 * 60 * 1000;
  const da = new Date(a + "T00:00:00Z");
  const db_ = new Date(b + "T00:00:00Z");
  return Math.round((db_ - da) / msPerDay);
};

// Reward schedule — customize freely. Cycles back to day 1 reward after day 7.
// Keeping this here (not in DB) means it's easy to read/tune; move to app_config
// if you want it admin-editable later.
const STREAK_REWARDS = [10, 15, 20, 25, 30, 40, 100]; // index 0 = day 1

const rewardForDay = (streakDay) => {
  const idx = (streakDay - 1) % STREAK_REWARDS.length;
  return STREAK_REWARDS[idx];
};

// ─── GET /api/streak ──────────────────────────────────────────────────────────
// Returns current streak status without mutating anything
exports.getStreakStatus = async (req, res) => {
  try {
    const user_id = req.user.id;
    const user = await User.findByPk(user_id, {
      attributes: ["id", "current_streak", "longest_streak", "last_claimed_date"],
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const today = todayDateOnly();
    const lastClaimed = user.last_claimed_date;

    let claimedToday = false;
    let effectiveStreak = user.current_streak;

    if (lastClaimed) {
      const gap = daysBetween(lastClaimed, today);
      if (gap === 0) {
        claimedToday = true;
      } else if (gap > 1) {
        // Streak would reset on next claim — reflect that in the status view
        effectiveStreak = 0;
      }
    }

    const nextDay = claimedToday ? effectiveStreak : effectiveStreak + 1;

    return res.status(200).json({
      data: {
        current_streak: effectiveStreak,
        longest_streak: user.longest_streak,
        claimed_today: claimedToday,
        last_claimed_date: lastClaimed,
        next_reward: rewardForDay(nextDay),
        next_day: nextDay,
        upcoming_rewards: Array.from({ length: STREAK_REWARDS.length }, (_, i) =>
          rewardForDay(i + 1)
        ),
      },
    });
  } catch (err) {
    console.error("[getStreakStatus]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── POST /api/streak/claim ────────────────────────────────────────────────────
// Manual claim button — idempotent per calendar day, resets streak if a day
// was skipped entirely.
exports.claimStreak = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user_id = req.user.id;

    const user = await User.findByPk(user_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    const today = todayDateOnly();
    const lastClaimed = user.last_claimed_date;

    if (lastClaimed) {
      const gap = daysBetween(lastClaimed, today);

      if (gap === 0) {
        await t.rollback();
        return res.status(409).json({
          message: "Already claimed today — come back tomorrow",
          data: {
            current_streak: user.current_streak,
            claimed_today: true,
          },
        });
      }
    }

    // Determine new streak count
    let newStreak;
    if (!lastClaimed) {
      newStreak = 1; // first ever claim
    } else {
      const gap = daysBetween(lastClaimed, today);
      newStreak = gap === 1 ? user.current_streak + 1 : 1; // consecutive vs missed day(s)
    }

    const reward = rewardForDay(newStreak);
    const newLongest = Math.max(user.longest_streak, newStreak);

    const { wallet } = await transferTokens({
      user_id,
      wallet_type: "shopping",
      type: "credit",
      source: "streak_reward",
      tokens: reward,
      remarks: `Day ${newStreak} login streak reward`,
      transaction: t,
    });

    await user.update(
      {
        current_streak: newStreak,
        longest_streak: newLongest,
        last_claimed_date: today,
      },
      { transaction: t }
    );

    await t.commit();

    return res.status(200).json({
      message: `Day ${newStreak} reward claimed!`,
      data: {
        current_streak: newStreak,
        longest_streak: newLongest,
        tokens_won: reward,
        shopping_token_balance: wallet.shopping_token_balance,
        next_reward: rewardForDay(newStreak + 1),
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("[claimStreak]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};