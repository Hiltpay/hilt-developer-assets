import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  address,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  createPaymentSignature,
  decodePaymentRequiredHeader,
  getHiltExactTransfers,
  HILT_EXACT_SCHEME,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  SOLANA_USDC_MINT,
} from "@hiltpay/sdk/x402";

export async function payAndRetry(
  response402: Response,
  originalRequest: Request,
  rpcUrl: string,
  payer: TransactionSigner,
): Promise<Response> {
  if (response402.status !== 402) {
    throw new Error("Expected a 402 Payment Required response.");
  }
  const encodedRequirement = response402.headers.get(PAYMENT_REQUIRED_HEADER);
  if (!encodedRequirement) {
    throw new Error("402 response did not contain PAYMENT-REQUIRED.");
  }

  const requirement = decodePaymentRequiredHeader(encodedRequirement);
  if (requirement.accepts.length !== 1) {
    throw new Error("Hilt requires exactly one advertised acceptance.");
  }
  const acceptance = requirement.accepts[0];
  const transfers = acceptance.scheme === HILT_EXACT_SCHEME
    ? getHiltExactTransfers(acceptance)
    : acceptance.scheme === "exact"
      ? [{
          role: "merchant" as const,
          asset: acceptance.asset,
          amount: acceptance.amount,
          payTo: acceptance.payTo,
        }]
      : (() => { throw new Error("Unsupported x402 payment scheme."); })();
  const mint = address(SOLANA_USDC_MINT);
  const [source] = await findAssociatedTokenPda({
    owner: payer.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
    mint,
  });
  const instructions: Instruction[] = [];

  for (const transfer of transfers) {
    const recipient = address(transfer.payTo);
    const [destination] = await findAssociatedTokenPda({
      owner: recipient,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      mint,
    });
    instructions.push(
      getCreateAssociatedTokenIdempotentInstruction({
        payer,
        ata: destination,
        owner: recipient,
        mint,
      }),
      getTransferCheckedInstruction({
        source,
        destination,
        mint,
        authority: payer,
        amount: BigInt(transfer.amount),
        decimals: 6,
      }),
    );
  }

  const rpc = createSolanaRpc(rpcUrl);
  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (message) => setTransactionMessageFeePayerSigner(payer, message),
    (message) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message),
    (message) => appendTransactionMessageInstructions(instructions, message),
  );
  const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
  const signedTransactionBase64 = getBase64EncodedWireTransaction(signedTransaction);
  const payment = createPaymentSignature(
    requirement,
    signedTransactionBase64,
  );
  const headers = new Headers(originalRequest.headers);
  headers.set(PAYMENT_SIGNATURE_HEADER, payment.paymentSignature);
  return fetch(new Request(originalRequest, { headers }));
}
