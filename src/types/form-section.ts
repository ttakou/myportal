import type { StageRole } from "./workflow";

export type SectionType =
  | "employee_info"
  | "business_goals"
  | "individual_objectives"
  | "department_objectives"
  | "okrs"
  | "competencies"
  | "skills"
  | "development_plan"
  | "training_needs"
  | "career_aspirations"
  | "mobility"
  | "employee_comments"
  | "manager_comments"
  | "overall_rating"
  | "promotion_recommendation"
  | "salary_recommendation"
  | "potential"
  | "succession"
  | "signoff";

export const SECTION_TYPES: SectionType[] = [
  "employee_info",
  "business_goals",
  "individual_objectives",
  "department_objectives",
  "okrs",
  "competencies",
  "skills",
  "development_plan",
  "training_needs",
  "career_aspirations",
  "mobility",
  "employee_comments",
  "manager_comments",
  "overall_rating",
  "promotion_recommendation",
  "salary_recommendation",
  "potential",
  "succession",
  "signoff",
];

export const SECTION_TYPE_LABEL: Record<SectionType, string> = {
  employee_info: "Employee information",
  business_goals: "Business goals",
  individual_objectives: "Individual objectives",
  department_objectives: "Department objectives",
  okrs: "OKRs",
  competencies: "Competencies",
  skills: "Skills assessment",
  development_plan: "Development plan",
  training_needs: "Training needs",
  career_aspirations: "Career aspirations",
  mobility: "Mobility preferences",
  employee_comments: "Employee comments",
  manager_comments: "Manager comments",
  overall_rating: "Overall rating",
  promotion_recommendation: "Promotion recommendation",
  salary_recommendation: "Salary recommendation",
  potential: "Potential assessment",
  succession: "Succession readiness",
  signoff: "Sign-off",
};

export interface FormSection {
  key: string;
  type: SectionType;
  title: string;
  instructions: string | null;
  mandatory: boolean;
  visibleRoles: StageRole[];
  editableRoles: StageRole[];
  weight: number;
  maxScore: number | null;
  condition: string | null;
  evidenceRequired: boolean;
  allowAttachments: boolean;
  allowComments: boolean;
}

export function defaultSection(type: SectionType): FormSection {
  return {
    key: `${type}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    title: SECTION_TYPE_LABEL[type],
    instructions: null,
    mandatory: true,
    visibleRoles: ["employee", "line_manager", "hr"],
    editableRoles: ["employee"],
    weight: 0,
    maxScore: null,
    condition: null,
    evidenceRequired: false,
    allowAttachments: false,
    allowComments: true,
  };
}
