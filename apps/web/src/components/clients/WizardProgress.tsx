"use client";

import { Check } from "lucide-react";

export type WizardStep = {
  label: string;
  description: string;
};

type WizardProgressProps = {
  steps: WizardStep[];
  activeStep: number;
  completedSteps: number[];
  onStepSelect: (stepIndex: number) => void;
};

export function WizardProgress({
  steps,
  activeStep,
  completedSteps,
  onStepSelect
}: WizardProgressProps) {
  return (
    <nav className="wizard-progress" aria-label="Client creation steps">
      {steps.map((step, index) => {
        const isActive = index === activeStep;
        const isComplete = completedSteps.includes(index);
        const canOpen = index <= activeStep || isComplete;

        return (
          <button
            key={step.label}
            type="button"
            className={[
              "wizard-step",
              isActive ? "active" : "",
              isComplete ? "complete" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={`${step.label}${
              isActive ? ", current step" : isComplete ? ", completed" : ", not yet available"
            }`}
            aria-current={isActive ? "step" : undefined}
            disabled={!canOpen}
            onClick={() => onStepSelect(index)}
          >
            <span className="wizard-step-marker" aria-hidden="true">
              {isComplete ? <Check size={15} /> : index + 1}
            </span>
            <span>
              <strong>{step.label}</strong>
              <small>{step.description}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
