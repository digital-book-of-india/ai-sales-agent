export const IMPORTABLE_FIELDS = [
  'name',
  'phone',
  'alternatePhone',
  'email',
  'companyName',
  'designation',
  'industry',
  'city',
  'state',
  'source',
  'requirement',
  'budget',
  'timeline',
  'tags',
] as const;

export type ImportableField = (typeof IMPORTABLE_FIELDS)[number];

export const REQUIRED_IMPORT_FIELDS: ImportableField[] = ['name', 'phone'];

export const FIELD_ALIASES: Record<ImportableField, string[]> = {
  name: ['name', 'fullname', 'leadname', 'customername', 'contactname'],
  phone: [
    'phone',
    'phonenumber',
    'mobile',
    'mobilenumber',
    'contact',
    'contactnumber',
    'primaryphone',
    'cell',
  ],
  alternatePhone: [
    'alternatephone',
    'alternatenumber',
    'secondaryphone',
    'altphone',
    'whatsapp',
    'whatsappnumber',
  ],
  email: ['email', 'emailaddress', 'mail', 'emailid'],
  companyName: [
    'company',
    'companyname',
    'organization',
    'organisation',
    'business',
    'employer',
  ],
  designation: ['designation', 'title', 'jobtitle', 'role', 'position'],
  industry: ['industry', 'sector', 'vertical'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  source: ['source', 'leadsource', 'channel', 'campaign'],
  requirement: ['requirement', 'requirements', 'need', 'needs'],
  budget: ['budget', 'budgetamount', 'budgetinr'],
  timeline: ['timeline', 'timeframe', 'expectedclosure'],
  tags: ['tags', 'labels', 'categories'],
};
