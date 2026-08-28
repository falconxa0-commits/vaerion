/**
 * vae-agent — budget meter (D11.5, D20.5).
 *
 * Budget accounting conserves: spent + remaining = granted, always.
 * Exhaustion is a hard stop that produces a graceful partial receipt —
 * never a soft overrun.
 */

import { addMoney, compareMoney, ZERO_MONEY } from "vae-foundation";

export class BudgetExhaustedError extends Error {
  constructor(readonly spentSteps: number, readonly grantedSteps: number) {
    super(`budget exhausted at step ${spentSteps + 1} of ${grantedSteps} granted steps`);
    this.name = "BudgetExhaustedError";
  }
}

export class BudgetMeter {
  private spentSteps = 0;
  private spentMoney = ZERO_MONEY;

  constructor(
    private readonly maxSteps: number,
    private readonly maxUsd: string,
  ) {}

  /** Charge one step; throws the typed exhaustion error on hard stop. */
  chargeStep(costUsd?: string): void {
    if (this.spentSteps + 1 > this.maxSteps) {
      throw new BudgetExhaustedError(this.spentSteps, this.maxSteps);
    }
    this.spentSteps++;
    if (costUsd !== undefined) {
      const next = addMoney(this.spentMoney, costUsd);
      if (compareMoney(next, this.maxUsd) > 0) {
        throw new BudgetExhaustedError(this.spentSteps, this.maxSteps);
      }
      this.spentMoney = next;
    }
  }

  get stepsSpent(): number {
    return this.spentSteps;
  }

  get stepsRemaining(): number {
    return Math.max(0, this.maxSteps - this.spentSteps);
  }

  get moneySpent(): string {
    return this.spentMoney;
  }

  /** Conservation invariant: spent + remaining == granted (D20.5). */
  conservationHolds(): boolean {
    return this.spentSteps + this.stepsRemaining === this.maxSteps;
  }
}
