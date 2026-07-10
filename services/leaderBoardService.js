const db = require("../db/db-connection");
const { leaderboard: Leaderboard, sequelize } = db;
const { Op } = require("sequelize");

/**
 * Called whenever a user earns shopping tokens (spinner reward).
 * Updates their score and surgically re-ranks only affected rows.
 *
 * @param {number} user_id
 * @param {number} tokens_earned   - shopping tokens just earned (always positive)
 * @param {object} transaction     - Sequelize transaction (caller owns it)
 */
const updateLeaderboardScore = async (user_id, tokens_earned, transaction) => {
  // ── 1. Upsert leaderboard row for this user ───────────────────────────────
  let [entry] = await Leaderboard.findOrCreate({
    where: { user_id },
    defaults: {
      user_id,
      total_shopping_tokens_earned: 0,
      total_spins: 0,
      total_referrals: 0,
      rank: null,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const old_score = entry.total_shopping_tokens_earned;
  const new_score = old_score + tokens_earned;

  await entry.update(
    {
      total_shopping_tokens_earned: new_score,
      total_spins: entry.total_spins + 1,
    },
    { transaction }
  );

  // ── 2. Find how many users have a STRICTLY higher score than new_score ────
  // That count + 1 = this user's new rank
  const usersAbove = await Leaderboard.count({
    where: {
      user_id: { [Op.ne]: user_id },
      total_shopping_tokens_earned: { [Op.gt]: new_score },
    },
    transaction,
  });

  const new_rank = usersAbove + 1;
  const old_rank = entry.rank;

  await entry.update({ rank: new_rank }, { transaction });

  // ── 3. Shift ranks of users displaced by this user's new position ─────────
  // Only needed if this user actually moved up (rank improved or was null)
  if (old_rank === null || new_rank < old_rank) {
    // Users who had a rank between new_rank and (old_rank - 1) get pushed down by 1
    // If old_rank was null they were unranked — anyone >= new_rank shifts down
    const shiftUpperBound = old_rank ? old_rank - 1 : null;

    const shiftWhere = {
      user_id: { [Op.ne]: user_id },
      rank: {
        [Op.gte]: new_rank,
        // Only shift up to old_rank - 1 to avoid touching unaffected rows
        ...(shiftUpperBound && { [Op.lte]: shiftUpperBound }),
      },
    };

    await Leaderboard.increment("rank", {
      by: 1,
      where: shiftWhere,
      transaction,
    });
  }
};

/**
 * Called when a referral completes.
 * Increments total_referrals counter on the referrer's leaderboard row.
 *
 * @param {number} referrer_id
 * @param {object} transaction
 */
const incrementReferralCount = async (referrer_id, transaction) => {
  const [entry] = await Leaderboard.findOrCreate({
    where: { user_id: referrer_id },
    defaults: {
      user_id: referrer_id,
      total_shopping_tokens_earned: 0,
      total_spins: 0,
      total_referrals: 0,
      rank: null,
    },
    transaction,
  });

  await entry.increment("total_referrals", { by: 1, transaction });
};

module.exports = { updateLeaderboardScore, incrementReferralCount };