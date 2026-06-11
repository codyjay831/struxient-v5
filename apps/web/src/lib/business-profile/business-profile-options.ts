import {
  BusinessProfileCustomerMarket,
  BusinessProfileOperatingModel,
  BusinessProfileTeamSize,
  BusinessProfileTrade,
  BusinessProfileWorkType,
} from "@prisma/client";

export type LabeledOption<T extends string> = {
  value: T;
  label: string;
};

export const BUSINESS_PROFILE_TRADE_OPTIONS: readonly LabeledOption<BusinessProfileTrade>[] = [
  { value: BusinessProfileTrade.ELECTRICAL, label: "Electrical" },
  { value: BusinessProfileTrade.SOLAR, label: "Solar" },
  { value: BusinessProfileTrade.ROOFING, label: "Roofing" },
  { value: BusinessProfileTrade.HVAC, label: "HVAC" },
  { value: BusinessProfileTrade.PLUMBING, label: "Plumbing" },
  { value: BusinessProfileTrade.GENERAL_CONTRACTING, label: "General contracting" },
  { value: BusinessProfileTrade.REMODELING, label: "Remodeling" },
  { value: BusinessProfileTrade.OTHER, label: "Other" },
];

export const BUSINESS_PROFILE_WORK_TYPE_OPTIONS: readonly LabeledOption<BusinessProfileWorkType>[] =
  [
    { value: BusinessProfileWorkType.SERVICE_REPAIR, label: "Service and repair" },
    { value: BusinessProfileWorkType.REPLACEMENT, label: "Replacement" },
    { value: BusinessProfileWorkType.INSTALLATION, label: "Installation" },
    { value: BusinessProfileWorkType.REMODEL, label: "Remodel" },
    { value: BusinessProfileWorkType.NEW_CONSTRUCTION, label: "New construction" },
    { value: BusinessProfileWorkType.MAINTENANCE, label: "Maintenance" },
    { value: BusinessProfileWorkType.MULTI_STEP_PROJECTS, label: "Multi-step projects" },
    { value: BusinessProfileWorkType.OTHER, label: "Other" },
  ];

export const BUSINESS_PROFILE_CUSTOMER_MARKET_OPTIONS: readonly LabeledOption<BusinessProfileCustomerMarket>[] =
  [
    { value: BusinessProfileCustomerMarket.RESIDENTIAL, label: "Residential customers" },
    { value: BusinessProfileCustomerMarket.COMMERCIAL, label: "Commercial customers" },
    { value: BusinessProfileCustomerMarket.PROPERTY_MANAGERS, label: "Property managers" },
    {
      value: BusinessProfileCustomerMarket.BUILDERS_GENERAL_CONTRACTORS,
      label: "Builders or general contractors",
    },
    { value: BusinessProfileCustomerMarket.OTHER, label: "Other" },
  ];

export const BUSINESS_PROFILE_OPERATING_MODEL_OPTIONS: readonly LabeledOption<BusinessProfileOperatingModel>[] =
  [
    { value: BusinessProfileOperatingModel.OWNER_OPERATOR, label: "Owner-operator" },
    { value: BusinessProfileOperatingModel.EMPLOYEES, label: "Employees" },
    { value: BusinessProfileOperatingModel.SUBCONTRACTORS, label: "Subcontractors" },
    {
      value: BusinessProfileOperatingModel.EMPLOYEES_AND_SUBCONTRACTORS,
      label: "Employees and subcontractors",
    },
  ];

export const BUSINESS_PROFILE_TEAM_SIZE_OPTIONS: readonly LabeledOption<BusinessProfileTeamSize>[] = [
  { value: BusinessProfileTeamSize.JUST_ME, label: "Just me" },
  { value: BusinessProfileTeamSize.TWO_TO_FIVE, label: "2-5" },
  { value: BusinessProfileTeamSize.SIX_TO_FIFTEEN, label: "6-15" },
  { value: BusinessProfileTeamSize.SIXTEEN_TO_FIFTY, label: "16-50" },
  { value: BusinessProfileTeamSize.FIFTY_ONE_PLUS, label: "51+" },
];

