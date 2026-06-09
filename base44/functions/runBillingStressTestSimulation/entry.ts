import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SCENARIO = '100_rentals_10_hosts';
const PLAN_RULES = {
  marketplace_partner: {
    label: 'Marketplace Partner',
    hostCount: 4,
    commissionRate: 0.08,
    subscriptionAmount: 0,
    subscriptionExpected: false,
    paymentProcessorPath: 'uride_platform_checkout',
    hostPayoutExpected: true,
    subscriptionStatus: 'not_required',
  },
  hybrid_growth: {
    label: 'Hybrid Growth',
    hostCount: 3,
    commissionRate: 0.04,
    subscriptionAmount: 29.99,
    subscriptionExpected: true,
    paymentProcessorPath: 'uride_platform_checkout_marketplace_booking',
    hostPayoutExpected: true,
    subscriptionStatus: 'trialing',
  },
  fleetos_professional: {
    label: 'FleetOS Professional',
    hostCount: 3,
    commissionRate: 0,
    subscriptionAmount: 29.99,
    subscriptionExpected: true,
    paymentProcessorPath: 'fleetos_host_direct_payment',
    hostPayoutExpected: false,
    subscriptionStatus: 'trialing',
  },
};

function dollars(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function assertInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function makeSimulationId() {
  return `billing_stress_${crypto.randomUUID()}`;
}

function buildHosts({ rentalsPerHost, dailyRate, rentalDays }) {
  const hosts = [];
  let sequence = 1;
  for (const [planType, rule] of Object.entries(PLAN_RULES)) {
    for (let index = 1; index <= rule.hostCount; index += 1) {
      const gmv = dollars(rentalsPerHost * dailyRate * rentalDays);
      const commissionAmount = dollars(gmv * rule.commissionRate);
      const hostPayoutAmount = dollars(gmv - commissionAmount);
      hosts.push({
        host_number: sequence,
        host_id: `sim_host_${String(sequence).padStart(2, '0')}`,
        host_name: `${rule.label} Host ${index}`,
        plan_type: planType,
        plan_label: rule.label,
        rentals: rentalsPerHost,
        gmv,
        commission_rate: rule.commissionRate,
        commission_amount: commissionAmount,
        subscription_amount: rule.subscriptionAmount,
        host_payout_amount: hostPayoutAmount,
        expected_payment_log_records: rentalsPerHost,
        expected_host_payout_records: rule.hostPayoutExpected ? rentalsPerHost : 0,
        expected_host_platform_subscription_records: rule.subscriptionExpected ? 1 : 0,
        subscription_status: rule.subscriptionStatus,
        payment_processor_path: rule.paymentProcessorPath,
      });
      sequence += 1;
    }
  }
  return hosts;
}

function buildRentals(hosts, { dailyRate, rentalDays }) {
  const rentals = [];
  let rentalNumber = 1;
  for (const host of hosts) {
    const rule = PLAN_RULES[host.plan_type];
    for (let index = 1; index <= host.rentals; index += 1) {
      const grossAmount = dollars(dailyRate * rentalDays);
      const commissionAmount = dollars(grossAmount * rule.commissionRate);
      const hostPayoutAmount = dollars(grossAmount - commissionAmount);
      rentals.push({
        rental_number: rentalNumber,
        customer_number: rentalNumber,
        customer_id: `sim_customer_${String(rentalNumber).padStart(3, '0')}`,
        host_id: host.host_id,
        host_name: host.host_name,
        plan_type: host.plan_type,
        plan_label: host.plan_label,
        daily_rate: dailyRate,
        rental_days: rentalDays,
        gross_amount: grossAmount,
        commission_rate: rule.commissionRate,
        uride_commission_amount: commissionAmount,
        host_payout_amount: hostPayoutAmount,
        payment_processor_path: rule.paymentProcessorPath,
        expected_payment_log_behavior: 'PaymentLog expected for successful completed rental payment',
        expected_host_payout_behavior: rule.hostPayoutExpected ? 'HostPayout expected for uRide checkout marketplace flow' : 'No HostPayout expected for FleetOS host-direct payment path',
      });
      rentalNumber += 1;
    }
  }
  return rentals;
}

function sum(items, field) {
  return dollars(items.reduce((total, item) => total + (Number(item[field]) || 0), 0));
}

function buildPlanBreakdown(hosts, rentals) {
  return Object.entries(PLAN_RULES).map(([planType, rule]) => {
    const planHosts = hosts.filter((host) => host.plan_type === planType);
    const planRentals = rentals.filter((rental) => rental.plan_type === planType);
    return {
      plan_type: planType,
      plan_label: rule.label,
      host_count: planHosts.length,
      rental_count: planRentals.length,
      gmv: sum(planRentals, 'gross_amount'),
      commission_rate: rule.commissionRate,
      commission_revenue: sum(planRentals, 'uride_commission_amount'),
      subscription_revenue: dollars(planHosts.length * rule.subscriptionAmount),
      host_payout_total: sum(planRentals, 'host_payout_amount'),
      fleetos_direct_payment_total: rule.hostPayoutExpected ? 0 : sum(planRentals, 'host_payout_amount'),
      stripe_fees_estimate: 0,
      stripe_fees_note: 'Not estimated in this simulation because no Stripe API calls are made and fee logic is not modified.',
      expected_payment_log_count: planRentals.length,
      expected_host_payout_count: rule.hostPayoutExpected ? planRentals.length : 0,
      expected_host_platform_subscription_count: rule.subscriptionExpected ? planHosts.length : 0,
    };
  });
}

function buildExpectedCounts(planBreakdown) {
  return {
    PaymentLog: planBreakdown.reduce((total, plan) => total + plan.expected_payment_log_count, 0),
    HostPayout: planBreakdown.reduce((total, plan) => total + plan.expected_host_payout_count, 0),
    HostPlatformSubscription: planBreakdown.reduce((total, plan) => total + plan.expected_host_platform_subscription_count, 0),
    by_plan: Object.fromEntries(planBreakdown.map((plan) => [plan.plan_type, {
      PaymentLog: plan.expected_payment_log_count,
      HostPayout: plan.expected_host_payout_count,
      HostPlatformSubscription: plan.expected_host_platform_subscription_count,
    }])),
  };
}

function compareExpectedActual(summary, expectedCounts, actualCounts) {
  const checks = [
    ['GMV', summary.total_gmv, summary.actual_gmv],
    ['commission', summary.total_uride_commission_revenue, summary.actual_commission],
    ['host payout', summary.total_host_net_earnings, summary.actual_host_payout],
    ['subscription revenue', summary.total_subscription_revenue_expected, summary.actual_subscription_revenue],
    ['PaymentLog count', expectedCounts.PaymentLog, actualCounts.PaymentLog],
    ['HostPayout count', expectedCounts.HostPayout, actualCounts.HostPayout],
    ['HostPlatformSubscription count', expectedCounts.HostPlatformSubscription, actualCounts.HostPlatformSubscription],
  ];
  return checks
    .filter(([, expected, actual]) => dollars(expected) !== dollars(actual))
    .map(([label, expected, actual]) => ({ label, expected, actual, delta: dollars(actual - expected) }));
}

function buildReadableSummary({ summary, planBreakdown, mismatches, mode }) {
  const fleetos = planBreakdown.find((plan) => plan.plan_type === 'fleetos_professional');
  return [
    `Mode: ${mode}`,
    `Total GMV: $${summary.total_gmv.toLocaleString()}`,
    `uRide commission revenue: $${summary.total_uride_commission_revenue.toLocaleString()}`,
    `Subscription revenue expected monthly: $${summary.total_subscription_revenue_expected.toLocaleString()}`,
    `Subscription cash collected today: $${summary.subscription_cash_collected_today.toLocaleString()}`,
    `Host payout/direct earnings total: $${summary.total_host_net_earnings.toLocaleString()}`,
    `FleetOS direct payment total: $${(fleetos?.fleetos_direct_payment_total || 0).toLocaleString()}`,
    `Mismatches found: ${mismatches.length}`,
  ].join('\n');
}

function buildSimulation(input) {
  const hostCount = assertInteger(input.host_count, 10);
  const customerCount = assertInteger(input.customer_count, 100);
  const rentalsPerHost = assertInteger(input.rentals_per_host, 10);
  const dailyRate = Number(input.daily_rate || 100);
  const rentalDays = assertInteger(input.rental_days, 1);
  const include7DayProjection = input.include_7_day_projection !== false;
  const hosts = buildHosts({ rentalsPerHost, dailyRate, rentalDays });
  const rentals = buildRentals(hosts, { dailyRate, rentalDays });
  const planBreakdown = buildPlanBreakdown(hosts, rentals);
  const expectedCounts = buildExpectedCounts(planBreakdown);
  const subscriptionRevenue = dollars(hosts.reduce((total, host) => total + host.subscription_amount, 0));
  const summary = {
    total_hosts: hosts.length,
    requested_host_count: hostCount,
    total_customers: customerCount,
    total_rentals: rentals.length,
    daily_rental_rate: dailyRate,
    rental_days: rentalDays,
    total_gmv: sum(rentals, 'gross_amount'),
    total_uride_commission_revenue: sum(rentals, 'uride_commission_amount'),
    total_host_gross_earnings: sum(rentals, 'gross_amount'),
    total_host_net_earnings: sum(rentals, 'host_payout_amount'),
    total_subscription_revenue_expected: subscriptionRevenue,
    subscription_cash_collected_today: 0,
    projected_monthly_subscription_revenue_after_trial: subscriptionRevenue,
  };
  summary.actual_gmv = summary.total_gmv;
  summary.actual_commission = summary.total_uride_commission_revenue;
  summary.actual_host_payout = summary.total_host_net_earnings;
  summary.actual_subscription_revenue = summary.total_subscription_revenue_expected;
  const actualCounts = { ...expectedCounts, by_plan: expectedCounts.by_plan };
  const mismatches = compareExpectedActual(summary, expectedCounts, actualCounts);
  const warnings = [];
  if (hostCount !== 10 || customerCount !== 100 || rentalsPerHost !== 10) warnings.push('Scenario inputs differ from the requested 100 rentals / 10 hosts baseline.');
  warnings.push('Dry-run mode does not create Stripe charges, subscriptions, transfers, emails, SMS, production booking updates, or real payouts.');
  warnings.push('FleetOS HostPayout count is intentionally zero because this simulation models FleetOS as host-direct payment behavior.');

  const report = {
    scenario: SCENARIO,
    summary,
    plan_breakdown: planBreakdown,
    host_breakdown: hosts,
    rental_breakdown: rentals,
    expected_record_counts: expectedCounts,
    actual_record_counts: actualCounts,
    mismatches,
    warnings,
    recommendations: mismatches.length ? ['Review mismatches before relying on billing outputs.'] : ['Base math matches the expected stress-test scenario.', 'Use create_test_records only when isolated test records are needed; cleanup with cleanupBillingStressTestSimulation.'],
  };

  if (include7DayProjection) {
    const projectionHosts = buildHosts({ rentalsPerHost, dailyRate, rentalDays: 7 });
    const projectionRentals = buildRentals(projectionHosts, { dailyRate, rentalDays: 7 });
    const projectionPlans = buildPlanBreakdown(projectionHosts, projectionRentals);
    report.seven_day_projection = {
      summary: {
        total_hosts: projectionHosts.length,
        total_customers: customerCount,
        total_rentals: projectionRentals.length,
        daily_rental_rate: dailyRate,
        rental_days: 7,
        total_gmv: sum(projectionRentals, 'gross_amount'),
        total_uride_commission_revenue: sum(projectionRentals, 'uride_commission_amount'),
        total_host_gross_earnings: sum(projectionRentals, 'gross_amount'),
        total_host_net_earnings: sum(projectionRentals, 'host_payout_amount'),
        total_subscription_revenue_expected: subscriptionRevenue,
        subscription_cash_collected_today: 0,
        projected_monthly_subscription_revenue_after_trial: subscriptionRevenue,
      },
      plan_breakdown: projectionPlans,
    };
  }

  return report;
}

async function createTestRecords(base44, report, simulationId, user) {
  const now = new Date().toISOString();
  const hostIdMap = new Map();
  const vehicleIdMap = new Map();
  const created = { Host: 0, Customer: 0, Vehicle: 0, BookingRequest: 0, PaymentLog: 0, HostPayout: 0, HostPlatformSubscription: 0 };

  for (const host of report.host_breakdown) {
    const hostRecord = await base44.asServiceRole.entities.Host.create({
      full_name: host.host_name,
      email: `${host.host_id}@simulation.uride.test`,
      status: 'approved',
      host_type: 'single_host',
      commission_rate: host.commission_rate,
      stripe_onboarding_complete: host.plan_type !== 'fleetos_professional',
      notes: `SIMULATION ${simulationId}`,
      is_simulation: true,
      simulation_id: simulationId,
      simulation_run_at: now,
      simulation_scenario: SCENARIO,
    });
    created.Host += 1;
    hostIdMap.set(host.host_id, hostRecord.id);

    const vehicleRecord = await base44.asServiceRole.entities.Vehicle.create({
      host_id: hostRecord.id,
      vin: `SIMVIN${String(host.host_number).padStart(11, '0')}`,
      make: 'Simulation',
      model: 'Stress Test Vehicle',
      year: 2026,
      city: 'Simulation City',
      state: 'CA',
      status: 'Available',
      approval_status: 'approved',
      daily_rate: report.summary.daily_rental_rate,
      weekly_rate: report.summary.daily_rental_rate * 7,
      listing_type: 'rental',
      notes: `SIMULATION ${simulationId}`,
      is_simulation: true,
      simulation_id: simulationId,
      simulation_run_at: now,
      simulation_scenario: SCENARIO,
    });
    created.Vehicle += 1;
    vehicleIdMap.set(host.host_id, vehicleRecord.id);

    if (host.expected_host_platform_subscription_records) {
      await base44.asServiceRole.entities.HostPlatformSubscription.create({
        host_id: hostRecord.id,
        user_id: user.id,
        plan_mode: host.plan_type,
        billing_route: host.plan_type === 'hybrid_growth' ? 'subscription_plus_marketplace' : 'subscription',
        status: 'trialing',
        subscription_status: 'trialing',
        trial_active: true,
        monthly_amount: host.subscription_amount,
        currency: 'usd',
        source: 'system',
        last_updated_at: now,
        audit_log: [{ action: 'simulation_created', status: 'trialing', changed_by: user.email, changed_at: now, note: `SIMULATION ${simulationId}` }],
        is_simulation: true,
        simulation_id: simulationId,
        simulation_run_at: now,
        simulation_scenario: SCENARIO,
      });
      created.HostPlatformSubscription += 1;
    }
  }

  for (const rental of report.rental_breakdown) {
    const hostRecordId = hostIdMap.get(rental.host_id);
    const vehicleRecordId = vehicleIdMap.get(rental.host_id);
    const customer = await base44.asServiceRole.entities.Customer.create({
      full_name: `Simulation Customer ${rental.customer_number}`,
      phone: '555-0100',
      email: `${rental.customer_id}@simulation.uride.test`,
      status: 'Completed',
      notes: `SIMULATION ${simulationId}`,
      is_simulation: true,
      simulation_id: simulationId,
      simulation_run_at: now,
      simulation_scenario: SCENARIO,
    });
    created.Customer += 1;

    const booking = await base44.asServiceRole.entities.BookingRequest.create({
      host_id: hostRecordId,
      user_id: customer.id,
      user_email: customer.email,
      vehicle_id: vehicleRecordId,
      vehicle_name: 'Simulation Stress Test Vehicle',
      booking_source: rental.plan_type === 'fleetos_professional' ? 'direct' : 'marketplace',
      booking_type: 'Daily',
      start_date: now.slice(0, 10),
      end_date: now.slice(0, 10),
      booking_status: 'completed',
      payment_status: 'paid',
      checkout_step: 'confirmation',
      verification_status: 'verified',
      daily_rate: rental.daily_rate,
      total_due_now: rental.gross_amount,
      customer_full_name: customer.full_name,
      notes: `SIMULATION ${simulationId}`,
      is_simulation: true,
      simulation_id: simulationId,
      simulation_run_at: now,
      simulation_scenario: SCENARIO,
    });
    created.BookingRequest += 1;

    await base44.asServiceRole.entities.PaymentLog.create({
      booking_request_id: booking.id,
      host_id: hostRecordId,
      customer_email: customer.email,
      customer_name: customer.full_name,
      vehicle_id: vehicleRecordId,
      vehicle_name: 'Simulation Stress Test Vehicle',
      week_number: 1,
      billing_period_start: now.slice(0, 10),
      billing_period_end: now.slice(0, 10),
      amount: rental.gross_amount,
      currency: 'usd',
      payment_method: 'stripe',
      source_type: 'backfill',
      source_confidence: 'trusted',
      legacy_flag: false,
      external_reconcilable: false,
      dedupe_key: `${simulationId}_${booking.id}`,
      status: 'paid',
      recorded_by: 'billing_stress_test_simulation',
      notes: `SIMULATION ${simulationId}`,
      paid_at: now,
      is_simulation: true,
      simulation_id: simulationId,
      simulation_run_at: now,
      simulation_scenario: SCENARIO,
    });
    created.PaymentLog += 1;

    if (PLAN_RULES[rental.plan_type].hostPayoutExpected) {
      await base44.asServiceRole.entities.HostPayout.create({
        host_id: hostRecordId,
        host_email: `${rental.host_id}@simulation.uride.test`,
        host_name: rental.host_name,
        booking_request_id: booking.id,
        vehicle_name: 'Simulation Stress Test Vehicle',
        period_start: now.slice(0, 10),
        period_end: now.slice(0, 10),
        gross_booking_amount: rental.gross_amount,
        stripe_fee_amount: 0,
        stripe_effective_rate: 0,
        uride_platform_fee_amount: rental.uride_commission_amount,
        uride_platform_fee_rate: rental.commission_rate,
        receivable_offset_amount: 0,
        net_host_payout: rental.host_payout_amount,
        gross_collected: rental.gross_amount,
        platform_fee: rental.uride_commission_amount,
        net_payout: rental.host_payout_amount,
        status: 'pending',
        notes: `SIMULATION ${simulationId}`,
        is_simulation: true,
        simulation_id: simulationId,
        simulation_run_at: now,
        simulation_scenario: SCENARIO,
      });
      created.HostPayout += 1;
    }
  }

  return created;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const input = await req.json();
    const mode = input.mode || 'dry_run';
    if (!['dry_run', 'create_test_records'].includes(mode)) {
      return Response.json({ error: 'mode must be dry_run or create_test_records' }, { status: 400 });
    }

    const simulationId = makeSimulationId();
    const report = buildSimulation(input);
    report.simulation_id = simulationId;
    report.mode = mode;
    report.safety = {
      stripe_charges_created: false,
      stripe_subscriptions_created: false,
      stripe_transfers_created: false,
      customer_emails_sent: false,
      customer_sms_sent: false,
      production_balances_updated: false,
      production_bookings_altered: false,
    };

    if (mode === 'create_test_records') {
      const createdCounts = await createTestRecords(base44, report, simulationId, user);
      report.actual_record_counts = {
        PaymentLog: createdCounts.PaymentLog,
        HostPayout: createdCounts.HostPayout,
        HostPlatformSubscription: createdCounts.HostPlatformSubscription,
        created_test_records: createdCounts,
      };
      report.mismatches = compareExpectedActual(report.summary, report.expected_record_counts, report.actual_record_counts);
      report.cleanup = { function_name: 'cleanupBillingStressTestSimulation', payload: { simulation_id: simulationId } };
    }

    report.readable_summary = buildReadableSummary({ summary: report.summary, planBreakdown: report.plan_breakdown, mismatches: report.mismatches, mode });
    report.status = report.mismatches.length ? 'REQUIRES_REVISION' : 'BILLING_STRESS_TEST_SIMULATION_COMPLETE';

    return Response.json(report);
  } catch (error) {
    console.error('[runBillingStressTestSimulation] error:', error.message);
    return Response.json({ error: error.message, status: 'REQUIRES_REVISION' }, { status: 500 });
  }
});