import enUS from "../../messages/en-US.json";

export const CATEGORY_PRESETS = [
  { key: "housing", icon: "house" },
  { key: "utilities", icon: "zap" },
  { key: "food", icon: "utensils" },
  { key: "transportation", icon: "car" },
  { key: "healthAndPersonalCare", icon: "heart-pulse" },
  { key: "shopping", icon: "shopping-bag" },
  { key: "entertainment", icon: "clapperboard" },
  { key: "travel", icon: "plane" },
  { key: "education", icon: "graduation-cap" },
  { key: "giftsAndDonations", icon: "gift" },
  { key: "savingsAndInvestments", icon: "piggy-bank" },
] as const;

export type CategoryPresetKey = (typeof CATEGORY_PRESETS)[number]["key"];

// Pure — no Prisma import, no I/O. Builds exactly the row shape
// `prisma.category.createMany`'s `data` array needs, so it's testable
// without a database and reusable from the databaseHooks callback.
export function buildPresetCategoriesData(userId: string) {
  return CATEGORY_PRESETS.map(({ key, icon }) => ({
    userId,
    icon,
    systemLocaleKey: key,
    name: enUS.categories.presets[key].name,
    description: enUS.categories.presets[key].description,
  }));
}
