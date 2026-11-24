/**
 * The twelve marketing perspectives a campaign can take. Each angle carries its
 * own kicker and three interchangeable headlines, so the same feature can be
 * marketed repeatedly without repeating the same message.
 */

export const MARKETING_ANGLES = [
  {
    key: "pain_point",
    label: "Customer pain point",
    kicker: "THE COST OF DOING IT MANUALLY",
    objective: "Name the frustration before showing the fix",
    headlines: ["Still\nDoing This\nBy Hand?", "This Is\nWhere The\nWeek Goes.", "The Part\nNobody\nWants To Do."],
  },
  {
    key: "benefit",
    label: "Product benefit",
    kicker: "WHAT CHANGES DAY TO DAY",
    objective: "State the practical benefit in plain terms",
    headlines: ["The Part\nYou Stop\nWorrying About.", "One Less\nThing To\nCheck.", "Quietly\nHandled\nFor You."],
  },
  {
    key: "educational",
    label: "Educational",
    kicker: "A QUICK WALKTHROUGH",
    objective: "Teach how the feature works, without selling",
    headlines: ["How This\nActually\nWorks.", "What Happens\nAfter The\nTap.", "Behind\nThe Screen."],
  },
  {
    key: "problem_solution",
    label: "Problem and solution",
    kicker: "THE PROBLEM, THEN THE FIX",
    objective: "Contrast the old failure with the built-in fix",
    headlines: ["The Problem.\nThe Fix.", "It Used\nTo Break\nHere.", "Old Way.\nNew Way."],
  },
  {
    key: "time_savings",
    label: "Time savings",
    kicker: "TIME BACK IN YOUR WEEK",
    objective: "Quantify the admin hours removed",
    headlines: ["Hours Back\nEvery\nSingle Week.", "Less Admin.\nMore Fleet.", "Your Week,\nReturned."],
  },
  {
    key: "revenue_protection",
    label: "Revenue protection",
    kicker: "REVENUE, PROTECTED",
    objective: "Frame the feature as money kept, not money spent",
    headlines: ["Protect\nThe Revenue.", "Money That\nStays\nYours.", "No Silent\nLeaks."],
  },
  {
    key: "vehicle_protection",
    label: "Vehicle protection",
    kicker: "THE VEHICLE, PROTECTED",
    objective: "Frame the feature as asset protection",
    headlines: ["Protect\nThe Vehicle.", "Your Asset.\nStill\nIntact.", "Watched\nWhen You\nAre Not."],
  },
  {
    key: "automation",
    label: "Business automation",
    kicker: "OPERATIONS ON AUTOPILOT",
    objective: "Show the work happening without a person",
    headlines: ["Set It.\nForget It.", "It Runs\nWithout\nYou.", "No One\nHad To\nRemember."],
  },
  {
    key: "engagement_question",
    label: "Customer engagement question",
    kicker: "A QUESTION FOR OPERATORS",
    objective: "Invite a reply instead of pushing a sale",
    headlines: ["Who Is\nWatching\nThe Fleet?", "What Would\nYou Rather\nDo?", "How Do You\nTrack This\nToday?"],
  },
  {
    key: "traditional_vs_automated",
    label: "Traditional vs automated",
    kicker: "MANUAL VS. AUTOMATED",
    objective: "Compare the old operation with the platform",
    headlines: ["Manual vs.\nAutomated.", "Two Ways\nTo Run\nA Fleet.", "Same Job.\nHalf The\nMoving Parts."],
  },
  {
    key: "feature_discovery",
    label: "Feature discovery",
    kicker: "INSIDE THE PLATFORM",
    objective: "Reveal a capability operators already own",
    headlines: ["You Already\nHave This.", "It Is\nAlready\nOn.", "Hidden In\nPlain\nSight."],
  },
  {
    key: "growth",
    label: "Business growth",
    kicker: "BUILT TO SCALE",
    objective: "Connect the feature to adding vehicles",
    headlines: ["Grow Without\nMore Admin.", "More Cars.\nSame Team.", "Scale The\nFleet, Not\nThe Chaos."],
  },
];

export const ANGLE_BY_KEY = Object.fromEntries(
  MARKETING_ANGLES.map((angle) => [angle.key, angle])
);

export function headlineText(headline) {
  return String(headline || "").replace(/\n/g, " ");
}