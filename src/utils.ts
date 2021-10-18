import {
  Connection,
  PublicKey,
  Account,
  SystemProgram,
  Transaction,
  Keypair,
} from '@solana/web3.js';
import axios from 'axios';
import { blob, struct, nu64 } from 'buffer-layout';
import { AccountLayout, Token } from '@solana/spl-token';
import { TransactionInstruction } from '@solana/web3.js';
import { ATOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from './ids';
import Big from 'big.js';

export const STAKING_PROGRAM_ID = new PublicKey(
  'stkarvwmSzv2BygN5e2LeTwimTczLWHCKPKGC2zVLiq',
);
export const ZERO: Big = new Big(0);

export function notify(content: string) {
  if (content && process.env.WEBHOOK_URL) {
    try {
      axios.post(process.env.WEBHOOK_URL, { content });
    } catch (err) {
      console.error('Error posting to notify webhook:', err);
    }
  }
  console.log(content);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getUnixTs = () => {
  return new Date().getTime() / 1000;
};

export async function findLargestTokenAccountForOwner(
  connection: Connection,
  owner: Keypair,
  mint: PublicKey,
): Promise<{ publicKey: PublicKey; tokenAccount: Wallet }> {
  const response = await connection.getTokenAccountsByOwner(
    owner.publicKey,
    { mint },
    connection.commitment,
  );
  let max = -1;
  let maxTokenAccount: null | {
    mint: PublicKey;
    owner: PublicKey;
    amount: number;
  } = null;
  let maxPubkey: null | PublicKey = null;

  for (const { pubkey, account } of response.value) {
    const tokenAccount = parseTokenAccountData(account.data);
    if (tokenAccount.amount > max) {
      maxTokenAccount = tokenAccount;
      max = tokenAccount.amount;
      maxPubkey = pubkey;
    }
  }

  if (maxPubkey && maxTokenAccount) {
    return { publicKey: maxPubkey, tokenAccount: maxTokenAccount };
  } else {
    console.log('creating new token account');
    const transaction = new Transaction();
    const aTokenAccountPubkey = (
      await PublicKey.findProgramAddress(
        [
          owner.publicKey.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        ATOKEN_PROGRAM_ID,
      )
    )[0];

    transaction.add(
      Token.createAssociatedTokenAccountInstruction(
        ATOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mint,
        aTokenAccountPubkey,
        owner.publicKey,
        owner.publicKey,
      ),
    );
    await connection.sendTransaction(transaction, [owner]);
    return {
      publicKey: aTokenAccountPubkey,
      tokenAccount: { mint, amount: 0, owner: owner.publicKey },
    };
  }
}

export const ACCOUNT_LAYOUT = struct([
  blob(32, 'mint'),
  blob(32, 'owner'),
  nu64('amount'),
  blob(93),
]);

export function createTokenAccount(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  accountRentExempt: number,
  mint: PublicKey,
  owner: PublicKey,
  signers: Account[],
) {
  const account = createUninitializedAccount(
    instructions,
    payer,
    accountRentExempt,
    signers,
  );

  instructions.push(
    Token.createInitAccountInstruction(
      new PublicKey(TOKEN_PROGRAM_ID),
      mint,
      account,
      owner,
    ),
  );

  return account;
}

export function createUninitializedAccount(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  amount: number,
  signers: Account[],
) {
  const account = new Account();
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: account.publicKey,
      lamports: amount,
      space: AccountLayout.span,
      programId: new PublicKey(TOKEN_PROGRAM_ID),
    }),
  );

  signers.push(account);

  return account.publicKey;
}

export function parseTokenAccountData(data: Buffer): {
  mint: PublicKey;
  owner: PublicKey;
  amount: number;
} {
  let { mint, owner, amount } = ACCOUNT_LAYOUT.decode(data);
  return {
    mint: new PublicKey(mint),
    owner: new PublicKey(owner),
    amount,
  };
}

export interface Wallet {
  mint: PublicKey;
  owner: PublicKey;
  amount: number;
}
