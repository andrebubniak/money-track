import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  formatDigits,
  MoneyInput,
  MoneyInputProps,
  toCanonical,
  toDigits,
} from "@/components/ui/money-input";

describe("money-input helpers", () => {
  it("converts a canonical amount to digits", () => {
    expect(toDigits("1234.56")).toBe("123456");
    expect(toDigits("0.05")).toBe("005");
    expect(toDigits("")).toBe("");
  });

  it("formats digits with the comma-dot convention", () => {
    expect(formatDigits("123456", "COMMA_DOT")).toBe("1,234.56");
    expect(formatDigits("5", "COMMA_DOT")).toBe("0.05");
    expect(formatDigits("", "COMMA_DOT")).toBe("");
  });

  it("formats digits with the dot-comma convention", () => {
    expect(formatDigits("123456", "DOT_COMMA")).toBe("1.234,56");
    expect(formatDigits("999999999999", "DOT_COMMA")).toBe("9.999.999.999,99");
  });

  it("converts digits back to a canonical amount", () => {
    expect(toCanonical("123456")).toBe("1234.56");
    expect(toCanonical("5")).toBe("0.05");
    expect(toCanonical("")).toBe("");
  });

  it("round-trips every canonical value it produces", () => {
    // toCanonical always pads to at least three digits (whole "0" plus two
    // cent digits), so the round trip normalises anything shorter than that
    // up to a three-digit floor before the usual leading-zero trim applies —
    // "5" (five cents) comes back as "005", not "5". Both represent the same
    // $0.05, and `formatDigits` treats them identically; they are simply not
    // the same digit *string*, so the naive `digits.replace(...)` on the raw
    // input is the wrong expectation for that case.
    for (const digits of ["5", "005", "123456", "999999999999"]) {
      expect(toDigits(toCanonical(digits))).toBe(
        digits.padStart(3, "0").replace(/^0+(?=\d{3})/, ""),
      );
    }
  });
});

/**
 * `MoneyInput` is a controlled component: it renders whatever `value` says,
 * and React resets the DOM back to that prop after every keystroke — the
 * standard behaviour for any controlled `<input>`, not something specific to
 * this component. A real caller feeds `onValueChange` straight back into the
 * state that produces `value`, so each keystroke builds on the previous one.
 * `vi.fn()` alone does not do that, so `user.type()` against it would only
 * ever see the last character typed. This wrapper closes that loop the same
 * way a real form does, while leaving every assertion's expected value
 * exactly as specified.
 */
function ControlledMoneyInput({
  onValueChange,
  ...props
}: Omit<MoneyInputProps, "value"> & { value?: string }) {
  const [value, setValue] = useState(props.value ?? "");
  return (
    <MoneyInput
      {...props}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

describe("MoneyInput", () => {
  const setup = (value = "") => {
    const onValueChange = vi.fn();
    render(
      <ControlledMoneyInput
        value={value}
        onValueChange={onValueChange}
        numberFormat="COMMA_DOT"
        aria-label="Value"
      />,
    );
    return { onValueChange, input: screen.getByLabelText("Value") };
  };

  it("masks the last two digits as the decimals", async () => {
    const user = userEvent.setup();
    const { onValueChange, input } = setup();

    await user.type(input, "12345");

    expect(onValueChange).toHaveBeenLastCalledWith("123.45");
  });

  it("displays the value with the user's number format", () => {
    render(
      <MoneyInput
        value="1234.56"
        onValueChange={vi.fn()}
        numberFormat="DOT_COMMA"
        aria-label="Value"
      />,
    );

    expect(screen.getByLabelText("Value")).toHaveValue("1.234,56");
  });

  it("never accepts a minus sign", async () => {
    const user = userEvent.setup();
    const { onValueChange, input } = setup();

    await user.type(input, "-50");

    expect(onValueChange).toHaveBeenLastCalledWith("0.50");
    // A concrete assertion, not `expect.stringContaining` inside
    // `toHaveValue` — jest-dom compares that matcher by identity and the
    // assertion would pass on any value at all.
    expect((input as HTMLInputElement).value).not.toContain("-");
  });

  /**
   * Backspace has to be able to empty the field. The display always carries
   * at least three digits, so deleting the last significant one leaves the
   * digit string `"00"`, never `""` — and `"00"` canonicalises to `"0.00"`,
   * which derives straight back to `"00"`. That fixed point used to leave the
   * user staring at `0.00` and an `amount.tooSmall` error with no way out
   * short of select-all.
   */
  it("empties the field when the last significant digit is deleted", async () => {
    const user = userEvent.setup();
    const { onValueChange, input } = setup("0.05");

    await user.type(input, "{backspace}");

    expect(onValueChange).toHaveBeenLastCalledWith("");
    expect(input).toHaveValue("");
  });

  it("keeps deleting digits one at a time on the way down", async () => {
    const user = userEvent.setup();
    const { input } = setup("1234.56");

    await user.type(input, "{backspace}");
    expect(input).toHaveValue("123.45");

    await user.type(input, "{backspace}{backspace}{backspace}{backspace}{backspace}");
    expect(input).toHaveValue("");
  });

  // The other half of the Backspace fix: an all-zero digit string only means
  // "cleared" when it got there by deletion. Typing a zero must still enter a
  // zero, so the schema answers with `amount.tooSmall` rather than with
  // `amount.invalid` for a field the user did not leave empty.
  it("still accepts a typed zero", async () => {
    const user = userEvent.setup();
    const { onValueChange, input } = setup();

    await user.type(input, "0");

    expect(onValueChange).toHaveBeenLastCalledWith("0.00");
    expect(input).toHaveValue("0.00");
  });

  // Typing over a full selection is a *replacement*, not a deletion: the
  // digit string gets shorter, but the user is entering a value rather than
  // clearing one. Inferring "cleared" from that shortening blanked the field
  // and answered with `amount.invalid` for a field they had just filled in.
  // `{selectall}` does not drive a selection in this harness —
  // `initialSelectionStart`/`initialSelectionEnd` do.
  it("enters a zero typed over a full selection, rather than clearing", async () => {
    const user = userEvent.setup();
    const { onValueChange, input } = setup("1234.56");

    await user.type(input, "0", { initialSelectionStart: 0, initialSelectionEnd: 8 });

    expect(onValueChange).toHaveBeenLastCalledWith("0.00");
    expect(input).toHaveValue("0.00");
  });

  it("enters a value typed over a full selection", async () => {
    const user = userEvent.setup();
    const { input } = setup("1234.56");

    await user.type(input, "75", { initialSelectionStart: 0, initialSelectionEnd: 8 });

    expect(input).toHaveValue("0.75");
  });

  it("caps input at the Decimal(12,2) ceiling", async () => {
    const user = userEvent.setup();
    const { onValueChange, input } = setup();

    await user.type(input, "999999999999999");

    expect(onValueChange).toHaveBeenLastCalledWith("9999999999.99");
  });
});
