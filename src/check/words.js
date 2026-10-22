// Word lists behind the writing checks and job matching.

/** Openers that describe a duty rather than what you did. */
export const WEAK_OPENERS = [
  'responsible for', 'was responsible for', 'duties included', 'duties include', 'tasks included', 'worked on', 'worked with', 'helped', 'helped to', 'helped with',
  'assisted', 'assisted with', 'assisted in', 'tasked with', 'in charge of', 'involved in', 'was involved in', 'participated in', 'took part in', 'handled',
  'dealt with', 'my role was', 'my role involved', 'role involved', 'job involved', 'i was', 'i am', 'i have', 'used', 'did', 'got', 'tried to', 'attempted to', 'had to',
];

/** Strong verbs, grouped so suggestions fit what the bullet is about. */
export const STRONG_VERBS = {
  lead: ['Led', 'Directed', 'Headed', 'Managed', 'Coordinated', 'Mentored', 'Coached', 'Chaired', 'Oversaw', 'Steered'],
  build: ['Built', 'Created', 'Designed', 'Developed', 'Engineered', 'Launched', 'Set up', 'Established', 'Introduced', 'Produced'],
  improve: ['Improved', 'Increased', 'Reduced', 'Cut', 'Streamlined', 'Simplified', 'Automated', 'Accelerated', 'Strengthened', 'Overhauled'],
  win: ['Won', 'Secured', 'Delivered', 'Achieved', 'Exceeded', 'Grew', 'Generated', 'Negotiated', 'Saved', 'Expanded'],
  analyse: ['Analysed', 'Investigated', 'Identified', 'Evaluated', 'Researched', 'Assessed', 'Audited', 'Forecast', 'Modelled', 'Measured'],
  communicate: ['Presented', 'Wrote', 'Trained', 'Advised', 'Persuaded', 'Briefed', 'Negotiated', 'Published', 'Explained', 'Facilitated'],
  support: ['Supported', 'Resolved', 'Maintained', 'Organised', 'Prepared', 'Processed', 'Served', 'Arranged', 'Scheduled', 'Handled'],
};

export const CLICHES = [
  'team player', 'hard-working', 'hard working', 'hardworking', 'go-getter', 'go getter', 'think outside the box', 'thinking outside the box', 'results-driven', 'results driven',
  'detail-oriented', 'detail oriented', 'self-starter', 'self starter', 'self-motivated', 'highly motivated', 'passionate about', 'synergy', 'dynamic individual', 'proven track record',
  'excellent communication skills', 'excellent communicator', 'works well under pressure', 'work well under pressure', 'can work independently', 'best of breed', 'go the extra mile',
  'goal-oriented', 'goal oriented', 'strategic thinker', 'track record of success', 'motivated individual', 'enthusiastic individual', 'perfectionist', 'people person', 'fast learner', 'quick learner',
];

// Irregular past tenses; anything else follows the usual rules.
const IRREGULAR = {
  lead: 'led', build: 'built', run: 'ran', write: 'wrote', drive: 'drove', make: 'made', grow: 'grew', teach: 'taught', sell: 'sold', buy: 'bought', bring: 'brought',
  think: 'thought', set: 'set', cut: 'cut', put: 'put', take: 'took', give: 'gave', win: 'won', begin: 'began', keep: 'kept', hold: 'held', meet: 'met', oversee: 'oversaw',
  undertake: 'undertook', find: 'found', speak: 'spoke', spend: 'spent', send: 'sent', understand: 'understood', forecast: 'forecast', rebuild: 'rebuilt', rewrite: 'rewrote',
  overcome: 'overcame', lend: 'lent', feed: 'fed', fight: 'fought', choose: 'chose', draw: 'drew', show: 'showed', know: 'knew', see: 'saw', do: 'did', go: 'went', get: 'got', have: 'had', be: 'was', seek: 'sought', shoot: 'shot', stand: 'stood', tell: 'told', become: 'became',
};

/** Verbs people start bullets with (base form). */
export const COMMON_VERBS = new Set([
  ...Object.keys(IRREGULAR), 'manage', 'design', 'develop', 'create', 'deliver', 'support', 'maintain', 'implement', 'coordinate', 'organise', 'organize', 'plan', 'analyse', 'analyze',
  'improve', 'increase', 'reduce', 'launch', 'establish', 'introduce', 'produce', 'prepare', 'process', 'handle', 'resolve', 'train', 'mentor', 'coach', 'present', 'negotiate',
  'own', 'work', 'help', 'assist', 'monitor', 'review', 'report', 'ensure', 'provide', 'liaise', 'collaborate', 'communicate', 'conduct', 'perform', 'test', 'deploy', 'automate',
  'migrate', 'optimise', 'optimize', 'streamline', 'oversee', 'direct', 'supervise', 'recruit', 'interview', 'assess', 'evaluate', 'research', 'investigate', 'identify', 'answer',
  'serve', 'advise', 'consult', 'model', 'forecast', 'budget', 'schedule', 'arrange', 'administer', 'audit', 'reconcile', 'track', 'document', 'facilitate', 'chair', 'host',
  'contribute', 'architect', 'refactor', 'ship', 'scale', 'secure', 'generate', 'achieve', 'exceed', 'save', 'expand', 'grow', 'map', 'scope', 'drive', 'champion', 'spearhead',
  'lead', 'head', 'set', 'run', 'build', 'write', 'teach', 'sell', 'win', 'pilot', 'prototype', 'deliver', 'operate', 'respond', 'manage', 'update', 'upgrade', 'configure', 'install',
  'troubleshoot', 'debug', 'fix', 'diagnose', 'treat', 'care', 'cook', 'clean', 'stock', 'greet', 'process', 'record', 'collect', 'curate', 'edit', 'publish', 'photograph', 'illustrate',
]);

const VOWEL = /[aeiou]/;
/** Past tense of a base-form verb: manage -> managed, plan -> planned, lead -> led. */
export function pastTense(verb) {
  const v = verb.toLowerCase();
  if (IRREGULAR[v]) return IRREGULAR[v];
  if (v.endsWith('e')) return v + 'd';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ied';
  // Double a final consonant after a single short vowel in one-syllable verbs: plan -> planned, ship -> shipped.
  if (/^[^aeiou]*[aeiou][bdgklmnprt]$/.test(v) && v.length <= 4 && !/[wxy]$/.test(v)) return v + v.slice(-1) + 'ed';
  if (/(ff|ll)$/.test(v) || !VOWEL.test(v)) return v + 'ed';
  return v + 'ed';
}

/** If a bullet starts with a present-tense or -ing verb, its base form; otherwise null. */
export function leadingVerb(text) {
  const m = String(text).trim().match(/^([A-Za-z]+)\b/);
  if (!m) return null;
  const w = m[1].toLowerCase();
  if (COMMON_VERBS.has(w)) return { word: m[1], base: w, form: 'present' };
  if (w.endsWith('ing')) {
    const stem = w.slice(0, -3);
    for (const cand of [stem, stem + 'e', stem.slice(0, -1)]) if (COMMON_VERBS.has(cand)) return { word: m[1], base: cand, form: 'ing' };
  }
  if (w.endsWith('s') && !w.endsWith('ss')) {
    for (const cand of [w.slice(0, -1), w.slice(0, -2), w.replace(/ies$/, 'y')]) if (COMMON_VERBS.has(cand)) return { word: m[1], base: cand, form: 'third' };
  }
  return null;
}

/** Proper spellings of names people often get wrong. */
export const PROPER_NAMES = {
  javascript: 'JavaScript', typescript: 'TypeScript', github: 'GitHub', gitlab: 'GitLab', nodejs: 'Node.js', 'node.js': 'Node.js', postgresql: 'PostgreSQL', postgres: 'Postgres',
  mysql: 'MySQL', mongodb: 'MongoDB', jquery: 'jQuery', iphone: 'iPhone', ios: 'iOS', macos: 'macOS', linkedin: 'LinkedIn', youtube: 'YouTube', powerpoint: 'PowerPoint', 'power bi': 'Power BI',
  powerbi: 'Power BI', sharepoint: 'SharePoint', wordpress: 'WordPress', graphql: 'GraphQL', devops: 'DevOps', kubernetes: 'Kubernetes', docker: 'Docker', python: 'Python', django: 'Django',
  react: 'React', 'react.js': 'React', reactjs: 'React', vue: 'Vue', angular: 'Angular', 'c#': 'C#', 'f#': 'F#', '.net': '.NET', dotnet: '.NET', aws: 'AWS', gcp: 'GCP', azure: 'Azure',
  sql: 'SQL', html: 'HTML', css: 'CSS', php: 'PHP', excel: 'Excel', salesforce: 'Salesforce', hubspot: 'HubSpot', figma: 'Figma', photoshop: 'Photoshop', tableau: 'Tableau', jira: 'Jira',
  scrum: 'Scrum', agile: 'Agile', kanban: 'Kanban', terraform: 'Terraform', ansible: 'Ansible', linux: 'Linux', unix: 'Unix', java: 'Java', kotlin: 'Kotlin', swift: 'Swift',
  rust: 'Rust', ruby: 'Ruby', rails: 'Rails', 'ruby on rails': 'Ruby on Rails', redis: 'Redis', kafka: 'Kafka', spark: 'Spark', hadoop: 'Hadoop', snowflake: 'Snowflake', dbt: 'dbt', 'next.js': 'Next.js',
  nextjs: 'Next.js', webpack: 'Webpack', tensorflow: 'TensorFlow', pytorch: 'PyTorch', numpy: 'NumPy', pandas: 'pandas', matlab: 'MATLAB', sap: 'SAP', xero: 'Xero', quickbooks: 'QuickBooks',
  'microsoft office': 'Microsoft Office', 'ms office': 'Microsoft Office', outlook: 'Outlook', gdpr: 'GDPR', nhs: 'NHS', ux: 'UX', ui: 'UI', seo: 'SEO', api: 'API', apis: 'APIs', 'ci/cd': 'CI/CD',
  saas: 'SaaS', crm: 'CRM', erp: 'ERP', kpi: 'KPI', kpis: 'KPIs', okrs: 'OKRs',
};

/** Skills and tools to look for in job adverts (lower case). */
export const SKILL_TERMS = [
  // software
  'javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'go', 'golang', 'rust', 'ruby', 'php', 'kotlin', 'swift', 'scala', 'r', 'sql', 'nosql', 'html', 'css', 'sass', 'bash', 'powershell',
  'react', 'angular', 'vue', 'svelte', 'next.js', 'node.js', 'express', 'django', 'flask', 'fastapi', 'spring', 'spring boot', '.net', 'asp.net', 'rails', 'laravel', 'graphql', 'rest', 'rest apis', 'grpc',
  'aws', 'azure', 'gcp', 'google cloud', 'kubernetes', 'docker', 'terraform', 'ansible', 'helm', 'linux', 'git', 'github actions', 'jenkins', 'ci/cd', 'devops', 'sre', 'observability', 'prometheus', 'grafana',
  'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'kafka', 'rabbitmq', 'spark', 'airflow', 'dbt', 'snowflake', 'bigquery', 'databricks', 'hadoop', 'etl', 'data pipelines', 'data warehouse',
  'machine learning', 'deep learning', 'nlp', 'llms', 'generative ai', 'pytorch', 'tensorflow', 'scikit-learn', 'pandas', 'numpy', 'statistics', 'data analysis', 'data visualisation', 'data visualization',
  'tableau', 'power bi', 'looker', 'excel', 'microsoft office', 'google workspace', 'sharepoint', 'salesforce', 'hubspot', 'sap', 'oracle', 'jira', 'confluence', 'figma', 'sketch', 'adobe creative suite',
  'photoshop', 'illustrator', 'indesign', 'after effects', 'premiere pro', 'wordpress', 'seo', 'ppc', 'google analytics', 'content marketing', 'social media', 'email marketing', 'copywriting',
  'microservices', 'distributed systems', 'system design', 'security', 'cyber security', 'cybersecurity', 'penetration testing', 'iso 27001', 'cloud', 'serverless', 'mobile', 'ios', 'android',
  'testing', 'test automation', 'unit testing', 'tdd', 'accessibility', 'wcag', 'performance', 'api design', 'ux', 'ui', 'user research', 'prototyping', 'design systems', 'product management',
  // ways of working
  'agile', 'scrum', 'kanban', 'lean', 'prince2', 'itil', 'six sigma', 'waterfall', 'project management', 'programme management', 'change management', 'risk management', 'stakeholder management',
  'budgeting', 'forecasting', 'financial modelling', 'financial reporting', 'management accounts', 'audit', 'compliance', 'gdpr', 'procurement', 'supply chain', 'logistics', 'operations',
  'customer service', 'account management', 'business development', 'sales', 'negotiation', 'recruitment', 'onboarding', 'employee relations', 'payroll', 'training', 'coaching', 'mentoring',
  'leadership', 'line management', 'people management', 'team leadership', 'communication', 'presentation', 'problem solving', 'analytical', 'attention to detail', 'time management', 'organisation',
  'collaboration', 'teamwork', 'written communication', 'report writing', 'research', 'strategy', 'strategic planning', 'business analysis', 'requirements gathering', 'process improvement',
  'safeguarding', 'first aid', 'patient care', 'clinical', 'health and safety', 'food hygiene', 'driving licence', 'full driving licence', 'dbs', 'cscs',
  // qualifications
  'acca', 'cima', 'aca', 'aat', 'cipd', 'cips', 'cim', 'pmp', 'cissp', 'comptia', 'aws certified', 'azure certified', 'pgce', 'qts', 'nmc', 'hcpc', 'degree', 'masters', 'phd', 'chartered',
];

/** Same thing, different words. */
export const SYNONYMS = [
  ['javascript', 'js', 'ecmascript'], ['typescript', 'ts'], ['kubernetes', 'k8s'], ['postgresql', 'postgres', 'psql'], ['machine learning', 'ml'], ['artificial intelligence', 'ai'],
  ['ci/cd', 'continuous integration', 'continuous delivery', 'continuous deployment'], ['aws', 'amazon web services'], ['gcp', 'google cloud', 'google cloud platform'],
  ['azure', 'microsoft azure'], ['golang', 'go'], ['c#', 'csharp'], ['.net', 'dotnet'], ['node.js', 'node', 'nodejs'], ['react', 'reactjs', 'react.js'], ['vue', 'vuejs', 'vue.js'],
  ['data visualisation', 'data visualization', 'dataviz'], ['organisation', 'organization', 'organisational', 'organizational'], ['analysing', 'analyzing'], ['excel', 'microsoft excel', 'ms excel'],
  ['microsoft office', 'ms office', 'office 365', 'microsoft 365'], ['power bi', 'powerbi'], ['people management', 'line management', 'managing people', 'managed a team', 'team leadership'],
  ['stakeholder management', 'stakeholder engagement', 'managing stakeholders', 'stakeholders'], ['cyber security', 'cybersecurity', 'information security', 'infosec'],
  ['communication', 'communicating', 'communicator', 'communications'], ['presentation', 'presenting', 'presentations', 'presented'], ['leadership', 'led', 'leading', 'lead'],
  ['mentoring', 'mentored', 'mentor'], ['coaching', 'coached', 'coach'], ['budgeting', 'budgets', 'budget'], ['forecasting', 'forecasts', 'forecast'], ['testing', 'tested', 'tests'],
  ['user research', 'usability testing', 'user interviews'], ['product management', 'product manager', 'product owner'], ['project management', 'project manager', 'managed projects'],
  ['customer service', 'customer support', 'customer care'], ['etl', 'elt', 'data pipelines', 'data pipeline'], ['full driving licence', 'driving licence', 'clean licence', 'full uk driving licence'],
  ['degree', 'bsc', 'ba', 'beng', 'bachelor', 'graduate'], ['masters', 'msc', 'ma', 'master'], ['teamwork', 'team player', 'collaboration', 'collaborative', 'collaborated'],
];

export const STOPWORDS = new Set(('a about above across after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each ' +
  'either etc every few for from further had has have having he her here hers him his how i if in into is it its itself just least less like may me might more most must my no nor not of off on once only ' +
  'or other our ours out over own per please same shall she should so some such than that the their theirs them then there these they this those through to too under until up upon us very via was we ' +
  'well were what when where whether which while who whom whose why will with within without would you your yours yourself role roles job jobs candidate candidates position applicant applicants ' +
  'opportunity opportunities team teams company business work working experience years year strong excellent good great ability able including include includes new key looking seeking join ' +
  'someone person ideal successful required requirements requirement essential desirable preferred plus apply application salary benefits bonus pension holiday holidays days day week weeks month ' +
  'months hours based location remote hybrid office uk london full time part permanent contract responsibilities duties skills knowledge understanding across within ensure ensuring provide providing ' +
  'support supporting help helping make making use using used deliver delivering also want need needs needed get one two three first want wants various range wide high level levels day-to-day').split(/\s+/));
