const toNumber = (value) => Number(value || 0);

export function buildPayoutBackfillCandidates(successfulPaymentRows = []) {
  const duplicateGroups = new Map();
  successfulPaymentRows.forEach((row) => {
    const key = `${row.payment?.booking_request_id || "missing"}|${row.payment?.week_number || "missing"}`;
    duplicateGroups.set(key, (duplicateGroups.get(key) || 0) + 1);
  });

  return successfulPaymentRows
    .filter((row) => row.relatedPayoutCount === 0)
    .map((row) => {
      const grossAmount = toNumber(row.collectedAmount);
      const platformFeeRate = toNumber(row.host?.commission_rate || 0.08);
      const estimatedPlatformFee = grossAmount * platformFeeRate;
      const duplicateKey = `${row.payment?.booking_request_id || "missing"}|${row.payment?.week_number || "missing"}`;
      const hasDuplicateRisk = duplicateGroups.get(duplicateKey) > 1 || row.issueTypes?.includes("duplicate_risk");
      const unresolvedHost = !(row.payment?.host_id || row.booking?.host_id || row.host?.id);
      const unresolvedPayment = row.confidence === "unresolved" || row.confidence === "excluded";
      const hasStripeEvidence = Boolean(row.payment?.stripe_balance_transaction_id || row.payment?.stripe_charge_id || row.payment?.stripe_payment_intent_id);
      const likelyExternalPayout = Boolean(row.payment?.notes && /paid|payout|settled|sent/i.test(row.payment.notes));

      let candidateStatus = "review_required";
      if (hasDuplicateRisk) candidateStatus = "duplicate_risk";
      else if (unresolvedHost) candidateStatus = "unresolved_host";
      else if (unresolvedPayment) candidateStatus = "unresolved_payment";
      else if (row.issueTypes?.includes("booking_state_mismatch")) candidateStatus = "blocked";
      else if (row.confidence === "trusted" && !likelyExternalPayout) candidateStatus = "safe_candidate";

      return {
        _previewOnly: true,
        _nonExecutable: true,
        sourcePaymentId: row.payment?.id,
        hostId: row.payment?.host_id || row.booking?.host_id || row.host?.id,
        hostName: row.host?.business_name || row.host?.full_name || row.host?.email,
        bookingId: row.payment?.booking_request_id || row.booking?.id,
        vehicleId: row.payment?.vehicle_id || row.booking?.vehicle_id,
        weekNumber: row.payment?.week_number,
        grossAmount,
        estimatedPlatformFee,
        estimatedHostPayout: Math.max(0, grossAmount - estimatedPlatformFee),
        confidence: row.confidence,
        confidenceScore: row.confidenceScore || 0,
        candidateStatus,
        payoutRationale: "Generated from successful PaymentLog with no linked HostPayout; preview only.",
        safetyReason: candidateStatus === "safe_candidate"
          ? "Potentially safe for historical reporting after admin confirms no prior external payout."
          : "Not safe for payout creation until source, host, booking, duplicate, and external payout evidence are reviewed.",
        transferEvidenceStatus: hasStripeEvidence ? "stripe_payment_evidence_present" : "no_stripe_transfer_evidence",
        hasStripeTransferEvidence: hasStripeEvidence,
        duplicateRisk: hasDuplicateRisk,
        likelyAlreadyPaidExternally: likelyExternalPayout,
      };
    });
}