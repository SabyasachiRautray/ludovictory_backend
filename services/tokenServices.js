const db = require("../db/db-connection");
const { wallet: Wallet, token_transaction: TokenTransaction } = db;

/**
 * Credit or debit tokens from a specific wallet balance.
 *
 * @param {object}  params
 * @param {number}  params.user_id
 * @param {"referral"|"shopping"} params.wallet_type  — which balance to touch
 * @param {"credit"|"debit"}      params.type
 * @param {string}  params.source         — must match token_transaction source ENUM
 * @param {number}  params.tokens         — always positive
 * @param {number}  params.reference_id   — optional FK to source record
 * @param {string}  params.remarks        — optional note
 * @param {object}  params.transaction    — Sequelize transaction (caller owns it)
 *
 * @returns {{ wallet, tokenTransaction }}
 * @throws if wallet not found or balance would go negative
 */
const transferTokens = async ({
  user_id,
  wallet_type,
  type,
  source,
  tokens,
  reference_id = null,
  remarks = null,
  transaction,
}) => {
  const wallet = await Wallet.findOne({
    where: { user_id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!wallet) {
    throw new Error(`Wallet not found for user_id: ${user_id}`);
  }

  // Map wallet_type to the actual column name
  const balanceField =
    wallet_type === "referral"
      ? "referral_token_balance"
      : "shopping_token_balance";

  const currentBalance = wallet[balanceField];
  let new_balance;

  if (type === "credit") {
    new_balance = currentBalance + tokens;
  } else {
    if (currentBalance < tokens) {
      throw new Error(
        `Insufficient ${wallet_type} tokens. Has: ${currentBalance}, needs: ${tokens}`
      );
    }
    new_balance = currentBalance - tokens;
  }

  // Only update the affected balance column
  await wallet.update({ [balanceField]: new_balance }, { transaction });

  const tokenTransaction = await TokenTransaction.create(
    {
      user_id,
      wallet_type,
      type,
      source,
      tokens,
      balance_after: new_balance,
      reference_id,
      remarks,
    },
    { transaction }
  );

  return { wallet, tokenTransaction };
};

module.exports = { transferTokens };