import { describe, it, expect } from "vitest";
import { CATEGORY_ICONS, DEFAULT_CATEGORY_ICON, isCategoryIcon } from "./category-icons";

describe("category-icons", () => {
  it("should have exactly 113 icons", () => {
    expect(Object.keys(CATEGORY_ICONS)).toHaveLength(113);
  });

  it("should have layout-grid as default", () => {
    expect(DEFAULT_CATEGORY_ICON).toBe("layout-grid");
  });

  it("should have DEFAULT_CATEGORY_ICON in CATEGORY_ICONS", () => {
    expect(CATEGORY_ICONS[DEFAULT_CATEGORY_ICON]).toBeDefined();
  });

  it("should correctly narrow types with isCategoryIcon", () => {
    expect(isCategoryIcon("layout-grid")).toBe(true);
    expect(isCategoryIcon("house")).toBe(true);
    expect(isCategoryIcon("unknown-icon")).toBe(false);
  });

  it("should have all expected icon keys from the spec", () => {
    const expectedIcons = [
      // Housing
      "house",
      "key-round",
      "hammer",
      "wrench",
      "building",
      "building-2",
      "warehouse",
      "door-open",
      "bed",
      "sofa",
      // Utilities
      "zap",
      "flame",
      "droplet",
      "wifi",
      "phone",
      "plug",
      "lightbulb",
      "router",
      "satellite-dish",
      "thermometer",
      // Food
      "utensils",
      "utensils-crossed",
      "coffee",
      "pizza",
      "apple",
      "shopping-basket",
      "soup",
      "cake",
      "ice-cream-cone",
      "wine",
      "beer",
      "sandwich",
      // Transportation
      "car",
      "car-front",
      "bus",
      "train-front",
      "fuel",
      "bike",
      "plane",
      "ship",
      "circle-parking",
      "truck",
      "navigation",
      // Health and personal care
      "heart-pulse",
      "stethoscope",
      "pill",
      "syringe",
      "eye",
      "dumbbell",
      "cross",
      "shield-plus",
      "scissors",
      "sparkles",
      "activity",
      // Shopping
      "shopping-cart",
      "shopping-bag",
      "shirt",
      "gem",
      "watch",
      "tag",
      "package",
      "store",
      // Entertainment
      "tv",
      "gamepad-2",
      "film",
      "music",
      "clapperboard",
      "ticket",
      "party-popper",
      "camera",
      "headphones",
      "book-open",
      // Travel
      "plane-takeoff",
      "luggage",
      "map",
      "map-pin",
      "compass",
      "tent",
      "tree-palm",
      "globe",
      // Education
      "graduation-cap",
      "book",
      "book-open-text",
      "pencil",
      "backpack",
      "notebook",
      "ruler",
      "calculator",
      // Gifts and donations
      "gift",
      "heart-handshake",
      "hand-coins",
      "package-plus",
      // Savings and investments
      "piggy-bank",
      "landmark",
      "trending-up",
      "wallet",
      "coins",
      "banknote",
      "chart-line",
      "percent",
      "circle-dollar-sign",
      // General / other
      "layout-grid",
      "briefcase",
      "users",
      "baby",
      "paw-print",
      "credit-card",
      "wallet-cards",
      "receipt",
      "calendar",
      "bell",
      "smartphone",
      "printer",
    ];

    for (const icon of expectedIcons) {
      expect(CATEGORY_ICONS[icon as keyof typeof CATEGORY_ICONS]).toBeDefined();
    }
  });
});
