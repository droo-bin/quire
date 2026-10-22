"""Reading awkward CVs: what Quire pulls out of each file in test/fixtures/corpus (run `node scripts/build.mjs` first).

    python3 -m unittest discover -s test -p "test_corpus.py" -v

Every file copies a layout real CVs use (see make_corpus.py). Expectations are partial: a dict checks only the
keys it names, a list checks length and each item in order, an int against a list checks how many there are.
"""
import base64
import pathlib
import unittest

from playwright.sync_api import sync_playwright

from test_app import serve

CORPUS = pathlib.Path(__file__).resolve().parent / "fixtures" / "corpus"

IMPORT = """async ([b64, name]) => {
  const { importFile } = await import('./import/index.js');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const r = await importFile(new File([bytes], name));
  return { ...r.doc.resume, custom: r.doc.custom };
}"""


def job(position, name, start, end="", highlights=None, location=None, summary=None):
    j = {"position": position, "name": name, "startDate": start, "endDate": end}
    if highlights is not None:
        j["highlights"] = highlights
    if location is not None:
        j["location"] = location
    if summary is not None:
        j["summary"] = summary
    return j


def school(study, area, institution, start="", end="", score=None, summary=None):
    e = {"studyType": study, "area": area, "institution": institution, "startDate": start, "endDate": end}
    if score is not None:
        e["score"] = score
    if summary is not None:
        e["summary"] = summary
    return e


EXPECT = {
    "sidebar.pdf": {
        "basics": {
            "name": "Jo Fielding", "label": "Full Stack Software & Platform Engineer | DevOps Practitioner",
            "email": "jo.fielding@example.com", "url": "https://jofielding.example.dev",
            "location": {"city": "Leeds", "region": "England"},
            "profiles": [{"network": "LinkedIn", "username": "jo-fielding-example", "url": "https://www.linkedin.com/in/jo-fielding-example"}],
            "summary": "I am a software engineer and DevOps practitioner who ships dependable software quickly. I pick up new stacks fast, care about tests and automation, and have led and worked within agile teams from first requirements to running things in production.",
        },
        "work": [
            job("Co-Founder", "Fernleaf Labs", "2024-01", "", 2, summary="Co-founded Fernleaf Labs, a small company making scheduling software for community sports clubs."),
            job("Senior Software Engineer (Contractor)", "Northwind Finance", "2022-10", "2024-04", [
                "Built the journey framework that every new savings product now starts from, along with its configuration rules and shared design system components.",
                "Mentored three junior engineers through their first year.",
                "Stepped into leading the team for six months while the lead was away, keeping the release on track.",
            ]),
            job("Senior DevOps Engineer (Contractor)", "Example Health", "2021-11", "2022-07", [
                "Moved a secure file transfer platform from an on-premises OpenShift cluster to Amazon EKS using Terraform.",
                "Rebuilt the monitoring so the team was paged for the right things.",
            ], summary=""),
            # The second page's sidebar mustn't land in the middle of these; a bullet with a year in it stays a bullet.
            job("Technical Lead", "Sample Retail", "2019-05", "2021-11", [
                "Formed a new team for customer operations problems.", "Awarded Engineer of the Year 2020.",
                "Led the move of order emails from a marketing platform to a purpose-built service on Amazon SES.",
            ]),
            job("Software Engineer", "Brightside Studio", "2016-08", "2019-05", 2),
        ],
        "education": [
            school("Bachelor of Science (BSc)", "Mathematics and Physics", "The Open University", "2016-01", "2022-01", summary="Part-time"),
            school("Bachelor of Science (BSc)", "Psychology", "University of Leeds", "2012-09", "2015-06"),
        ],
        "skills": [
            {"name": "Programming / Scripting Languages", "keywords": ["JavaScript", "TypeScript", "Python", "Go", "Bash", "SQL"]},
            {"name": "DevOps & Automation", "keywords": 6},
            {"name": "Cloud Platforms", "keywords": ["AWS", "GCP"]},
            {"name": "Testing", "keywords": ["Jest", "Cypress", "Playwright", "React Testing Library"]},
            {"name": "Frameworks", "keywords": ["React", "Express", "Django", "Flask", "Apache Kafka", "Next.js", "Spring / Spring Boot"]},
            {"name": "Databases", "keywords": 4},
            {"name": "Methodologies", "keywords": ["Agile", "Scrum", "Test-Driven Development (TDD)", "Behaviour-Driven Development (BDD)"]},
            {"name": "Operating Systems", "keywords": ["Linux", "macOS"]},
        ],
        "languages": 0,
        "awards": [
            {"title": "Engineer of the Year", "awarder": "Sample Retail"},
            {"title": "Featured Writer: Software Engineering", "awarder": "Medium"},
        ],
        "publications": [
            {"name": "A Gentle Guide to Kubernetes", "publisher": "Medium", "summary": "The main ideas of Kubernetes, how to set up a cluster, and habits for running containers well."},
            {"name": "“Find It Fast” - A Guide to Debugging", "publisher": "Medium"},
        ],
        "custom": 0,
    },
    "symbol-bullets.pdf": {
        "basics": {"name": "Ruth Adeyemi", "label": "Staff Nurse", "email": "ruth.adeyemi@example.org", "phone": "07700 900654", "location": {"city": "Coventry", "region": "UK"}},
        "work": [
            job("Senior Staff Nurse", "Example University Hospital", "2019-03", "", ["Lead a team of eight nurses on a 30-bed surgical ward.", "Brought in a discharge checklist that cut delayed discharges by a quarter."]),
            job("Staff Nurse", "Sample Community Trust", "2015-09", "2019-02", 1),
        ],
        "education": [school("BSc (Hons)", "Adult Nursing", "Example University", "2012", "2015", score="2:1")],
        "skills": [{"name": "Skills", "keywords": ["IV therapy", "wound care", "medicines management", "mentoring students"]}],
    },
    "header-contacts.docx": {
        "basics": {
            "name": "Robin Asante", "email": "robin@example.dev", "phone": "07700 900987",
            "profiles": [{"network": "Twitter", "username": "robin_builds"}, {"network": "GitHub", "username": "robinasante", "url": "https://github.com/robinasante"}],
            "summary": "Senior Cloud Engineer with a focus on cloud native architecture and DevOps. I am an experienced software engineer with cloud and platform specialisms, building and running distributed systems at scale.",
        },
        "work": [
            job("Co-Founder", "Fernleaf Technology Limited", "2022-10", "", ["Product development: led the design of our core service from idea to production.", "Team leadership: hired and mentored our engineers."],
                summary="As a co-founder of Fernleaf Technology, a small consultancy, I helped set the company's direction and technology roadmap."),
            job("Senior Engineer (Contract)", "Example Bank", "2021-10", "2023-07", 2, summary="Example Bank is building a new cloud platform on Kubernetes. Golang, Terraform, Kubernetes"),
            job("Senior Platform Engineer - Golang", "Sample Payments", "2020-04", "2021-09", 1,
                summary="Sample Payments is a payments technology company. I was on the platform team building a multi-cloud platform."),
            job("Contract Platform and Cloud Native implementation", "Example Logistics", "2020-01", "2020-04", 0),
        ],
        "education": 0,
    },
    "table-layout.docx": {
        "basics": {"name": "Kim Novak-Hayes", "label": "Marketing Manager", "email": "kim.nh@example.com", "phone": "07700 900765", "location": {"city": "Brighton"},
                   "summary": "Marketer who grows audiences without shouting at them, with ten years in publishing and charities."},
        "work": [
            job("Marketing Manager", "Seagull Press", "2020-01", "", 2),
            job("Marketing Executive", "Example Charity", "2016", "2019", ["Ran the spring appeal, raising £120,000."]),
        ],
        "education": [school("BA (Hons)", "English Literature", "University of Sussex", "2012", "2015")],
        "skills": [{"name": "Skills", "keywords": ["Email marketing", "Copywriting", "Google Analytics", "Budget planning"]}],
        "languages": [{"language": "English", "fluency": "native"}, {"language": "Spanish", "fluency": "conversational"}],
    },
    "caps-and-dashes.txt": {
        "basics": {"name": "Sam Okafor", "label": "Product Designer", "phone": "07700 900456", "email": "sam.okafor@example.com", "location": {"city": "Leeds", "region": "UK"},
                   "profiles": [{"network": "LinkedIn", "username": "sam-okafor"}]},
        "work": [job("Lead Product Designer", "Fernleaf Digital", "2021", "", 2), job("Product Designer", "Northwind Ltd", "2018-03", "2021-06", 1)],
        "education": [school("BA (Hons)", "Graphic Design", "University of Leeds", "2012", "2015", score="2:1")],
        "skills": [{"name": "Design", "keywords": ["Figma", "Sketch", "prototyping"]}, {"name": "Research", "keywords": 2}],
        "languages": [{"language": "English", "fluency": "native"}, {"language": "French", "fluency": "fluent"}, {"language": "Igbo", "fluency": "conversational"}],
        "interests": 3,
    },
    "dates-first.txt": {
        "basics": {"name": "Priya Natarajan", "email": "priya.n@example.org", "phone": "+44 7700 900111", "location": {"city": "Bristol"}},
        "work": [
            job("Senior Data Analyst", "Example Health Trust", "2019", "", 2, location="Bristol", summary="Built the trust's first waiting-list forecast."),
            job("Data Analyst", "Sample Insights Ltd", "2016", "2019", 1),
        ],
        "education": [
            school("MSc", "Data Science", "University of Bath", "2015", "2016"),
            school("BSc", "Mathematics", "University of Exeter", "2012", "2015", score="First Class Honours"),
        ],
        "skills": [{"name": "Programming Languages", "keywords": ["Python", "R", "SQL", "JavaScript"]}],
        "languages": 0,
        "certificates": [{"name": "AWS Certified Cloud Practitioner", "issuer": "Amazon Web Services", "date": "2022"}, {"name": "Tableau Desktop Specialist", "issuer": "Tableau", "date": "2021"}],
    },
    "stacked-headings.txt": {
        "basics": {"name": "Tom Reyes", "label": "Software Engineer", "email": "tom@example.dev", "profiles": [{"network": "GitHub", "username": "tomreyes"}]},
        # "Key achievements:" belongs to the job, not an Achievements section.
        "work": [
            job("Software Engineer", "Acme Payments Ltd", "2020-06", "", ["Moved card processing to a new queue, cutting failures by 30%.", "Mentored two graduates."], location="London", summary=""),
            job("Junior Developer", "Brightside Studio", "2018-09", "2020-05", 0, summary="Built client websites in PHP and Vue."),
        ],
        "awards": 0,
        "education": [school("BSc (Hons)", "Computer Science", "Example University", "2015", "2018", score="2:1")],
        "skills": [{"name": "Skills", "keywords": 8}],
    },
    "personal-details.txt": {
        "basics": {"name": "Morgan Lee", "email": "morgan.lee@example.co.uk", "phone": "07700 900222", "location": {"address": "12 Example Road", "city": "Nottingham", "postalCode": "NG1 1AA"}},
        "work": [
            job("Shift Supervisor", "Sample Logistics Ltd", "2021-01", "", 2, location="Nottingham"),
            job("Warehouse Operative", "Sample Logistics Ltd", "2018-06", "2020-12", 1),
            job("Sales Assistant", "Example Retail (Seasonal)", "2016-11", "2017-01", 1),
        ],
        "education": [
            school("BTEC Level 3 Extended Diploma", "Business", "Example College", "2014", "2016", score="Merit"),
            school("GCSEs", "8 including English and Maths", "Example College", "2014", "2016", score="grades 9–5"),
        ],
        "interests": [{"name": "Five-a-side football"}, {"name": "volunteering at a food bank"}],
        "references": 0,
        "custom": [{"title": "Personal details", "items": [{"highlights": ["Driving licence: Full, clean"]}]}],
    },
    "one-line-roles.txt": {
        "basics": {"name": "Alex Kowalski", "label": "Senior Mechanical Engineer · Chartered (IMechE)", "url": "https://www.alexk.example.com", "location": {"city": "Derby"},
                   "summary": "Mechanical engineer with twelve years in rail and aerospace, most recently leading design teams on bogie systems for new trains."},
        "work": [
            job("Senior Mechanical Engineer", "Example Rail Systems", "2019", "", 2, location="Derby"),
            job("Mechanical Engineer", "Sample Aero plc", "2014-09", "2019-06", 1, location="Bristol"),
            job("Graduate Engineer", "Sample Aero plc", "2012", "2014", 0),
        ],
        "volunteer": [{"position": "STEM Ambassador", "organization": "Example Science Centre", "startDate": "2016", "endDate": "", "highlights": 1}],
        "projects": [{"name": "Electric go-kart", "url": "https://github.com/alexk/go-kart", "startDate": "2021", "description": "Built a 4 kW electric go-kart with my children."}],
        "education": [school("MEng", "Mechanical Engineering", "Example University", "2007", "2012", score="First")],
        "skills": [{"name": "Proficient in", "keywords": ["SolidWorks", "ANSYS", "MATLAB"]}, {"name": "Familiar with", "keywords": ["Python", "LabVIEW"]}],
        "certificates": [{"name": "Chartered Engineer (CEng)", "issuer": "IMechE", "date": "2018"}],
    },
    "dates-left.pdf": {
        # The running header and footer mustn't become the name, a heading, or part of a job.
        "basics": {"name": "Lee Chambers", "label": "Civil Engineer", "email": "lee.chambers@example.com", "phone": "07700 900444", "location": {"city": "Sheffield"}},
        "work": [
            job("Senior Civil Engineer", "Example Infrastructure Ltd", "2021", "", 2, location="Sheffield", summary=""),
            job("Civil Engineer", "Sample Consulting Group", "2018", "2020", 3, location="Leeds"),
            job("Civil Engineer 2", "Sample Partners 1", "2016", "2018", 3),
            job("Civil Engineer 3", "Sample Partners 2", "2014", "2016", 3),
            job("Graduate Engineer", "Example Council", "2010", "2012", 1),
            job("Site Technician", "Northern Contractors Ltd", "2008", "2010", ["Set out roads and drainage on site."]),
        ],
        "education": [school("MEng", "Civil Engineering", "University of Sheffield", "2004", "2008")],
        "skills": [{"name": "Skills", "keywords": ["AutoCAD Civil 3D", "MicroDrainage", "Revit", "site supervision"]}],
        "custom": 0,
    },
    "textbox.docx": {
        # Read once, though Word stores the text box twice; the footer's LinkedIn link kept, the header not doubled.
        "basics": {"name": "Dana Whitfield", "email": "dana.w@example.org", "phone": "07700 900555", "location": {"city": "Cardiff", "region": "Wales"},
                   "profiles": [{"network": "LinkedIn", "username": "dana-whitfield-example"}], "summary": "Primary school teacher who makes maths the favourite lesson."},
        "work": [job("Year 4 Class Teacher", "Example Primary School", "2019-09", "", ["Led maths across Key Stage 2."], location="Cardiff")],
        "education": [school("PGCE", "Primary", "Example University", "2018", "2019")],
        "custom": 0,
    },
    "us-style.txt": {
        "basics": {"name": "Jane A. Doe", "phone": "(555) 123-4567", "email": "jane.doe@example.com", "location": {"city": "Austin", "region": "TX"}},
        "work": [
            job("Staff Accountant", "Acme Corp.", "2019", "2023", ["Closed the books monthly for three entities.", "Automated bank reconciliations in Excel."]),
            job("Junior Accountant", "Sample Partners Inc.", "2017", "2019", ["Prepared quarterly VAT returns."]),
        ],
        "education": [school("B.S.", "Accounting", "Example State University", "", "2016")],
        "skills": [{"name": "Skills", "keywords": ["Excel (Advanced)", "QuickBooks (Intermediate)", "SQL"]}],
    },
    "no-headings.txt": {
        "basics": {"name": "Chris Mbeki", "email": "chris.mbeki@example.com", "phone": "07700 900888", "summary": ""},
        "work": [
            job("Senior Chef de Partie", "The Example Kitchen", "2020-03", "", ["Wrote the new dessert menu."], location="Manchester", summary="Run the pastry section for a 120-cover restaurant."),
            job("Chef de Partie", "Sample Hotel Group", "2017", "2020", 1, location="Liverpool"),
        ],
        "education": [school("Level 3 Diploma", "Professional Cookery", "Example College", "2015", "2017")],
    },
}


def check(test, got, want, path):
    if isinstance(want, dict):
        test.assertIsInstance(got, dict, path)
        for k, v in want.items():
            check(test, got.get(k), v, f"{path}.{k}")
    elif isinstance(want, list):
        test.assertIsInstance(got, list, path)
        test.assertEqual(len(got), len(want), f"{path}: {got}")
        for i, (g, w) in enumerate(zip(got, want)):
            check(test, g, w, f"{path}[{i}]")
    elif isinstance(want, int) and isinstance(got, list):
        test.assertEqual(len(got), want, f"{path}: {got}")
    else:
        test.assertEqual(got, want, path)


class Corpus(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = serve()
        url = f"http://127.0.0.1:{cls.server.server_address[1]}/?nosw"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()
        cls.page = cls.browser.new_page()
        cls.page.goto(url)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()

    def test_every_file_has_expectations(self):
        files = {p.name for p in CORPUS.iterdir() if p.suffix in (".pdf", ".docx", ".txt")}
        self.assertEqual(files, set(EXPECT))

    def test_corpus(self):
        for name, want in EXPECT.items():
            with self.subTest(file=name):
                data = base64.b64encode((CORPUS / name).read_bytes()).decode()
                got = self.page.evaluate(IMPORT, [data, name])
                check(self, got, want, name)


if __name__ == "__main__":
    unittest.main()
