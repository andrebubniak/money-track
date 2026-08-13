import { describe, it, expect } from "vitest";

import { buildPresetCategoriesData, CATEGORY_PRESETS } from "./category-presets";
import { CATEGORY_ICONS } from "./category-icons";
import enUS from "../../messages/en-US.json";

describe("buildPresetCategoriesData", () => {
  it("returns exactly 11 rows", () => {
    const data = buildPresetCategoriesData("test-user-id");
    expect(data).toHaveLength(11);
  });

  it("each row has the correct userId", () => {
    const userId = "test-user-123";
    const data = buildPresetCategoriesData(userId);
    data.forEach((row) => {
      expect(row.userId).toBe(userId);
    });
  });

  it("each row has systemLocaleKey matching a preset key", () => {
    const data = buildPresetCategoriesData("test-user-id");
    const presetKeys = CATEGORY_PRESETS.map(({ key }) => key);

    data.forEach((row) => {
      expect(presetKeys).toContain(row.systemLocaleKey);
    });
  });

  it("systemLocaleKey values are unique", () => {
    const data = buildPresetCategoriesData("test-user-id");
    const keys = data.map(({ systemLocaleKey }) => systemLocaleKey);
    const uniqueKeys = new Set(keys);

    expect(uniqueKeys.size).toBe(11);
    expect(keys.length).toBe(11);
  });

  it("each icon is a valid CATEGORY_ICONS key", () => {
    const data = buildPresetCategoriesData("test-user-id");
    data.forEach((row) => {
      expect(Object.hasOwn(CATEGORY_ICONS, row.icon)).toBe(true);
    });
  });

  it("each icon matches the corresponding preset's icon", () => {
    const data = buildPresetCategoriesData("test-user-id");
    const presetsByKey = Object.fromEntries(
      CATEGORY_PRESETS.map(({ key, icon }) => [key, icon])
    );

    data.forEach((row) => {
      expect(row.icon).toBe(presetsByKey[row.systemLocaleKey]);
    });
  });

  it("each name matches the English catalog entry", () => {
    const data = buildPresetCategoriesData("test-user-id");

    data.forEach((row) => {
      const catalogName =
        enUS.categories.presets[row.systemLocaleKey as keyof typeof enUS.categories.presets].name;
      expect(row.name).toBe(catalogName);
    });
  });

  it("each description matches the English catalog entry", () => {
    const data = buildPresetCategoriesData("test-user-id");

    data.forEach((row) => {
      const catalogDescription =
        enUS.categories.presets[row.systemLocaleKey as keyof typeof enUS.categories.presets].description;
      expect(row.description).toBe(catalogDescription);
    });
  });

  it("covers all 11 preset categories in the correct order", () => {
    const data = buildPresetCategoriesData("test-user-id");
    const expectedKeys = [
      "housing",
      "utilities",
      "food",
      "transportation",
      "healthAndPersonalCare",
      "shopping",
      "entertainment",
      "travel",
      "education",
      "giftsAndDonations",
      "savingsAndInvestments",
    ];

    data.forEach((row, index) => {
      expect(row.systemLocaleKey).toBe(expectedKeys[index]);
    });
  });
});
