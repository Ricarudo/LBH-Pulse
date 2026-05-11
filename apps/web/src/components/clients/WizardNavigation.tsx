"use client";

import { ArrowLeft, ArrowRight, Save, X } from "lucide-react";

type WizardNavigationProps = {
  activeStep: number;
  totalSteps: number;
  isSaving: boolean;
  onBack: () => void;
  onCancel: () => void;
  onNext: () => void;
};

export function WizardNavigation({
  activeStep,
  totalSteps,
  isSaving,
  onBack,
  onCancel,
  onNext
}: WizardNavigationProps) {
  const isFirstStep = activeStep === 0;
  const isLastStep = activeStep === totalSteps - 1;

  return (
    <div className="wizard-navigation">
      <button
        className="toolbar-button compact"
        type="button"
        onClick={onCancel}
        disabled={isSaving}
      >
        <X size={17} />
        Cancel
      </button>

      <div className="wizard-navigation-actions">
        <button
          className="toolbar-button compact"
          type="button"
          onClick={onBack}
          disabled={isFirstStep || isSaving}
        >
          <ArrowLeft size={17} />
          Back
        </button>
        {isLastStep ? (
          <button className="primary-button" type="submit" disabled={isSaving}>
            <Save size={17} />
            {isSaving ? "Creating..." : "Create Client"}
          </button>
        ) : (
          <button
            className="primary-button"
            type="button"
            onClick={onNext}
            disabled={isSaving}
          >
            Next
            <ArrowRight size={17} />
          </button>
        )}
      </div>
    </div>
  );
}
