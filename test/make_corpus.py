"""Makes the awkward-layout CVs in test/fixtures/corpus (all made-up people). Run once; outputs are committed.

    python3 test/make_corpus.py

Each file copies a layout that real CVs use and that's hard to read back: a sidebar that runs onto the next
page, contact details behind icon-font pictures, bullets drawn as pictures (only the indent is left),
Symbol-font bullets, a heading that wraps, page headers holding the contact details, a table used for the
page layout, and plain text written every which way. test_corpus.py checks what Quire reads from each.

Needs python-docx, reportlab and fontTools.
"""
import pathlib

from docx import Document
from docx.enum.text import WD_TAB_ALIGNMENT, WD_BREAK
from docx.shared import Pt, Mm
from fontTools.ttLib import TTFont as FontFile
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = pathlib.Path(__file__).resolve().parent / "fixtures" / "corpus"
HERE.mkdir(parents=True, exist_ok=True)
DEJAVU = pathlib.Path("/usr/share/fonts/truetype/dejavu")

# Font Awesome-style pictures live in the private-use area. DejaVu has no such characters, so a copy of it
# gets them (drawn as a dot): what matters is that the PDF says which character each picture is.
ICONS = {"location": "", "email": "", "web": "", "linkedin": "", "github": "", "phone": "", "bullet": ""}


def fonts(tmp):
    for name, file in [("Body", "DejaVuSans.ttf"), ("Bold", "DejaVuSans-Bold.ttf")]:
        f = FontFile(str(DEJAVU / file))
        dot = f.getBestCmap()[ord("•")]
        for table in f["cmap"].tables:
            if table.isUnicode():
                for ch in ICONS.values():
                    table.cmap[ord(ch)] = dot
        path = tmp / f"{name}.ttf"
        f.save(str(path))
        pdfmetrics.registerFont(TTFont(name, str(path)))


def wrap(text, font, size, width):
    lines, line = [], ""
    for word in text.split():
        test = (line + " " + word).strip()
        if pdfmetrics.stringWidth(test, font, size) > width and line:
            lines.append(line)
            line = word
        else:
            line = test
    return lines + [line] if line else lines


class Page:
    """Writes down a column, starting a new page when it runs out."""

    def __init__(self, c, x, width, top=800, bottom=50):
        self.c, self.x, self.width, self.y, self.top, self.bottom = c, x, width, top, top, bottom

    def text(self, s, font="Body", size=7.8, gap=10, x=0, right=None):
        if self.y - gap < self.bottom:
            raise RuntimeError("column full")
        self.y -= gap
        self.c.setFont(font, size)
        self.c.drawString(self.x + x, self.y, s)
        if right:
            self.c.drawRightString(self.x + self.width, self.y, right)

    def para(self, s, x=0, size=7.8, first_gap=13):
        for i, line in enumerate(wrap(s, "Body", size, self.width - x)):
            self.text(line, size=size, gap=first_gap if i == 0 else 10, x=x)


def sidebar_pdf(tmp):
    """Like a CV from an online builder: sidebar of skills, icons, picture bullets, three pages."""
    path = HERE / "sidebar.pdf"
    c = canvas.Canvas(str(path), pagesize=(595, 842))
    c.setTitle("CV")
    side, main = Page(c, 30, 110), Page(c, 158, 400)
    c.setFont("Bold", 28.8)
    c.drawString(30, 800, "Jo Fielding")
    c.setFont("Body", 11.4)
    c.drawString(30, 784, "Full Stack Software & Platform Engineer | DevOps Practitioner")
    side.y = main.y = 770

    side.text("About", size=8.4, gap=0)
    for icon, value in [("location", "Leeds England"), ("email", "jo.fielding@example.com"), ("web", "jofielding.example.dev"), ("linkedin", "jo-fielding-example")]:
        side.text(f"{ICONS[icon]} {value}", size=8.4, gap=18)
    side.text("Programming / Scripting", size=8.4, gap=29)
    side.text("Languages", size=8.4, gap=10)
    groups = [
        (None, ["JavaScript", "TypeScript", "Python", "Go", "Bash", "SQL"]),
        ("DevOps & Automation", ["CI/CD", "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins"]),
        ("Cloud Platforms", ["AWS", "GCP"]),
        ("Testing", ["Jest", "Cypress", "Playwright", "React Testing Library"]),
        ("Frameworks", ["React", "Express", "Django", "Flask", "Apache Kafka", "Next.js"]),
    ]
    page2_groups = [
        ("Databases", ["PostgreSQL", "MySQL", "Redis", "DynamoDB"]),
        ("Methodologies", ["Agile", "Scrum", "Test-Driven Development (TDD)", "Behaviour-Driven Development", "(BDD)"]),
        ("Operating Systems", ["Linux", "macOS"]),
    ]

    def group(g):
        name, items = g
        if name:
            side.text(name, size=8.4, gap=25)
        for k, item in enumerate(items):
            side.text(item, size=7.2, gap=23 if k == 0 and name else 10)

    for g in groups:
        group(g)

    main.text("Summary", size=8.4, gap=0)
    main.para("I am a software engineer and DevOps practitioner who ships dependable software quickly. I pick up new stacks fast, care about tests and automation, and have led and worked within agile teams from first requirements to running things in production.", first_gap=23)
    main.text("Experience", size=8.4, gap=28)

    jobs = [
        ("Fernleaf Labs", "01/2024 - Present", "Co-Founder", "Co-founded Fernleaf Labs, a small company making scheduling software for community sports clubs.",
         ["Building the booking product used by 40 clubs across the north of England every week of the season.", "Set up the deploy pipeline and on-call rota."]),
        ("Northwind Finance", "10/2022 - 04/2024", "Senior Software Engineer (Contractor)", "Worked across two product teams on regulated savings products, and mentored junior engineers.",
         ["Built the journey framework that every new savings product now starts from, along with its configuration rules and shared design system components.",
          "Mentored three junior engineers through their first year.", "Stepped into leading the team for six months while the lead was away, keeping the release on track."]),
        ("Example Health", "11/2021 - 07/2022", "Senior DevOps Engineer (Contractor)", None,
         ["Moved a secure file transfer platform from an on-premises OpenShift cluster to Amazon EKS using",
          "Terraform.", "Rebuilt the monitoring so the team was paged for the right things."]),
    ]
    # The third job's first bullet wraps onto a line that starts with a capital ("Terraform.").
    def job(page, company, dates, title, summary, bullets):
        page.text(company, size=8.4, gap=20, right=dates)
        page.text(title, size=8.4, gap=11)
        if summary:
            page.para(summary)
        first = True
        k = 0
        while k < len(bullets):
            b = bullets[k]
            if b.endswith("using"):
                page.text(b, gap=17 if first else 10, x=25)
                page.text(bullets[k + 1], gap=10, x=25)
                k += 2
            else:
                for i, line in enumerate(wrap(b, "Body", 7.8, page.width - 25)):
                    page.text(line, gap=(17 if first else 10) if i == 0 else 10, x=25)
                k += 1
            first = False

    for j in jobs:
        job(main, *j)

    c.showPage()
    side, main = Page(c, 30, 110), Page(c, 158, 400)
    side.y = main.y = 810
    side.text("Spring / Spring Boot", size=7.2, gap=0)  # the Frameworks list carries on
    for g in page2_groups:
        group(g)
    jobs2 = [
        ("Sample Retail", "05/2019 - 11/2021", "Technical Lead", None,
         ["Formed a new team for customer operations problems.", "Awarded Engineer of the Year 2020.", "Led the move of order emails from a marketing platform to a purpose-built service on Amazon SES."]),
        ("Brightside Studio", "08/2016 - 05/2019", "Software Engineer", None,
         ["Built client websites and the studio's first design system.", "Ran the weekly release."]),
    ]
    for j in jobs2:
        job(main, *j)

    c.showPage()
    main = Page(c, 158, 400)
    main.y = 810
    main.text("Education", size=8.4, gap=0)
    main.text("The Open University", size=8.4, gap=23, right="01/2016 - 01/2022")
    main.text("Bachelor of Science (BSc) (Part-time) Mathematics and Physics", size=8.4, gap=11)
    main.text("University of Leeds", size=8.4, gap=20, right="09/2012 - 06/2015")
    main.text("Bachelor of Science (BSc) Psychology", size=8.4, gap=11)
    main.text("Awards", size=8.4, gap=25)
    for title, by in [("Engineer of the Year", "Sample Retail"), ("Featured Writer: Software Engineering", "Medium")]:
        main.text(title, font="Bold", size=8.4, gap=21)
        main.text(by, gap=10)
    main.text("Publications", size=8.4, gap=28)
    for title, by, about in [
        ("A Gentle Guide to Kubernetes", "Medium", "The main ideas of Kubernetes, how to set up a cluster, and habits for running containers well."),
        ("“Find It Fast” - A Guide to Debugging", "Medium", "Ways to track down bugs quickly, and the tools that help."),
    ]:
        main.text(title, font="Bold", size=8.4, gap=21)
        main.text(by, gap=10)
        main.para(about)
    c.showPage()
    c.save()


def symbol_bullets_pdf():
    """A Word document saved as PDF: Symbol-font bullets, capitals headings, dates on the right."""
    path = HERE / "symbol-bullets.pdf"
    c = canvas.Canvas(str(path), pagesize=(595, 842))
    p = Page(c, 60, 475, top=790)
    c.setFont("Bold", 20)
    c.drawString(60, 790, "Ruth Adeyemi")
    p.y = 790
    p.text("Staff Nurse  |  ruth.adeyemi@example.org  |  07700 900654  |  Coventry, UK", size=10, gap=18)
    p.text("PROFILE", font="Bold", size=11, gap=26)
    p.para("Registered nurse with nine years on acute and surgical wards, known for steady leadership on busy shifts and for teaching students well.", size=10, first_gap=15)
    p.text("EXPERIENCE", font="Bold", size=11, gap=26)
    for title, dates, bullets in [
        ("Senior Staff Nurse, Example University Hospital", "Mar 2019 – Present",
         ["Lead a team of eight nurses on a 30-bed surgical ward.", "Brought in a discharge checklist that cut delayed discharges by a quarter."]),
        ("Staff Nurse, Sample Community Trust", "Sep 2015 – Feb 2019", ["Managed a caseload of up to 12 patients a shift."]),
    ]:
        p.text(title, font="Bold", size=10, gap=18, right=dates)
        for b in bullets:
            p.text(f"{ICONS['bullet']}   {b}", size=10, gap=14, x=12)
    p.text("EDUCATION", font="Bold", size=11, gap=26)
    p.text("BSc (Hons) Adult Nursing, Example University", font="Bold", size=10, gap=18, right="2012 – 2015")
    p.text("2:1", size=10, gap=14)
    p.text("SKILLS", font="Bold", size=11, gap=26)
    p.text("IV therapy, wound care, medicines management, mentoring students", size=10, gap=15)
    c.save()


def header_contacts_docx():
    """A Word CV with the name and contacts in the page header and big, unstyled headings."""
    d = Document()
    header = d.sections[0].header
    hp = header.paragraphs[0]
    r = hp.add_run("Robin Asante")
    r.font.size = Pt(30)
    header.add_paragraph("07700 900987  robin@example.dev Twitter: @robin_builds")
    header.add_paragraph("Github: @robinasante ")

    def para(text, size=12, bold=False):
        p = d.add_paragraph()
        run = p.add_run(text)
        run.font.size = Pt(size)
        run.bold = bold
        return p

    para("Profile", 30)
    para("Senior Cloud Engineer with a focus on cloud native architecture and DevOps.", 14)
    para("I am an experienced software engineer with cloud and platform specialisms, building and running distributed systems at scale.")
    h = d.add_heading("Experience", level=1)
    para("Co-Founder Fernleaf Technology Limited | October 2022 Onwards", 18, True)
    para("Co-Founder")
    para("As a co-founder of Fernleaf Technology, a small consultancy, I helped set the company's direction and technology roadmap.")
    para("My responsibilities included:")
    for b in ["Product development: led the design of our core service from idea to production.", "Team leadership: hired and mentored our engineers."]:
        d.add_paragraph(b, style="List Bullet")
    para("Contract with Example Bank | October 2021 to July 2023", 18)
    para("Senior Engineer", 14)
    para("Example Bank is building a new cloud platform on Kubernetes")
    para("Golang, Terraform")
    para("Kubernetes")
    for b in ["Designed and built a multi-tenant platform on Kubernetes", "Built monitoring and continuous testing for every service"]:
        d.add_paragraph(b, style="List Bullet")
    para("Sample Payments | April 2020 to September 2021", 18)
    para("Senior Platform Engineer - Golang", 14)
    p = para("Sample Payments is a payments technology company.")
    p.runs[0].add_break(WD_BREAK.LINE)
    p.add_run("I was on the platform team building a multi-cloud platform.")
    for b in ["Built a secure delivery pipeline with Flux and Terraform"]:
        d.add_paragraph(b, style="List Bullet")
    para("Contract at Example Logistics  | January 2020 to April 2020", 18)
    para("Contract Platform and Cloud Native implementation", 14)
    para("Contract work designing and building a multi-account AWS estate using Terraform.")
    d.save(HERE / "header-contacts.docx")


def table_layout_docx():
    """A Word template that lays the page out as a two-column table: sidebar left, the CV right."""
    d = Document()
    t = d.add_table(rows=1, cols=2)
    left, right = t.rows[0].cells
    left.width, right.width = Mm(60), Mm(120)

    def add(cell, text, style=None, bold=False, size=None, tab=None):
        p = cell.add_paragraph(style=style) if style else cell.add_paragraph()
        run = p.add_run(text)
        run.bold = bold
        if size:
            run.font.size = Pt(size)
        if tab:
            p.paragraph_format.tab_stops.add_tab_stop(Mm(115), WD_TAB_ALIGNMENT.RIGHT)
            p.add_run("\t" + tab)
        return p

    left.paragraphs[0].add_run("Kim Novak-Hayes").font.size = Pt(22)
    add(left, "Marketing Manager")
    add(left, "Contact", style="Heading 2")
    for x in ["kim.nh@example.com", "07700 900765", "Brighton"]:
        add(left, x)
    add(left, "Skills", style="Heading 2")
    for x in ["Email marketing", "Copywriting", "Google Analytics", "Budget planning"]:
        add(left, x)
    add(left, "Languages", style="Heading 2")
    for x in ["English – native", "Spanish – conversational"]:
        add(left, x)

    right.paragraphs[0].add_run("Profile").bold = True
    add(right, "Marketer who grows audiences without shouting at them, with ten years in publishing and charities.")
    add(right, "Experience", style="Heading 2")
    add(right, "Marketing Manager | Seagull Press", bold=True, tab="Jan 2020 – Present")
    for b in ["Grew the newsletter from 8,000 to 40,000 readers.", "Run a team of three."]:
        add(right, b, style="List Bullet")
    add(right, "Marketing Executive | Example Charity", bold=True, tab="2016 – 2019")
    add(right, "Ran the spring appeal, raising £120,000.", style="List Bullet")
    add(right, "Education", style="Heading 2")
    add(right, "BA (Hons) English Literature, University of Sussex", bold=True, tab="2012 – 2015")
    d.save(HERE / "table-layout.docx")


def dates_left_pdf():
    """Dates in their own column on the left, a running header and footer, and a page break mid-job."""
    path = HERE / "dates-left.pdf"
    c = canvas.Canvas(str(path), pagesize=(595, 842))

    def furniture(n):
        c.setFont("Body", 8)
        c.drawString(60, 815, "Lee Chambers · Curriculum Vitae")
        c.drawString(60, 30, f"lee.chambers@example.com · Page {n} of 2")

    furniture(1)
    c.setFont("Bold", 22)
    c.drawString(60, 770, "Lee Chambers")
    c.setFont("Body", 10)
    c.drawString(60, 752, "Civil Engineer · 07700 900444 · Sheffield")
    y = 715
    c.setFont("Bold", 12)
    c.drawString(60, y, "Experience")

    def entry(y, dates, title, org, bullets):
        c.setFont("Body", 9.5)
        c.drawString(60, y, dates)
        c.setFont("Bold", 10)
        c.drawString(170, y, title)
        c.setFont("Body", 10)
        c.drawString(170, y - 14, org)
        y -= 30
        for b in bullets:
            c.drawString(178, y, "• " + b)
            y -= 14
        return y - 10

    y = entry(y - 24, "2021 – Present", "Senior Civil Engineer", "Example Infrastructure Ltd, Sheffield",
              ["Lead design of drainage for a 600-home development.", "Check and sign off calculations for a team of four."])
    for k in range(3):
        y = entry(y, f"{2018 - k * 2} – {2020 - k * 2}", f"Civil Engineer {k + 1}" if k else "Civil Engineer", f"Sample Consulting Group, Leeds" if not k else f"Sample Partners {k}",
                  ["Designed highway junction improvements.", "Ran site supervision for resurfacing schemes.", "Prepared Section 278 agreements with the council."])
    y = entry(y, "2010 – 2012", "Graduate Engineer", "Example Council", ["Surveyed bridges across the district."])
    c.showPage()
    furniture(2)
    y = 780
    y = entry(y, "2008 – 2010", "Site Technician", "Northern Contractors Ltd", ["Set out roads and drainage on site."])
    c.setFont("Bold", 12)
    c.drawString(60, y - 10, "Education")
    y = entry(y - 34, "2004 – 2008", "MEng Civil Engineering", "University of Sheffield", [])
    c.setFont("Bold", 12)
    c.drawString(60, y - 10, "Skills")
    c.setFont("Body", 10)
    c.drawString(60, y - 28, "AutoCAD Civil 3D, MicroDrainage, Revit, site supervision")
    c.save()


def textbox_docx():
    """Name and contacts inside a text box (stored twice, as Word does), the same header on the first page
    and the rest, and a LinkedIn link in the footer."""
    from docx.oxml import parse_xml
    d = Document()
    sec = d.sections[0]
    sec.different_first_page_header_footer = True
    for hdr in (sec.header, sec.first_page_header):
        hdr.paragraphs[0].add_run("Dana Whitfield")
    for ftr in (sec.footer, sec.first_page_footer):
        ftr.paragraphs[0].add_run("linkedin.com/in/dana-whitfield-example")
    ns = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
          'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
          'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
          'xmlns:v="urn:schemas-microsoft-com:vml"')
    box = "".join(f"<w:p><w:r><w:t>{t}</w:t></w:r></w:p>" for t in ["dana.w@example.org", "07700 900555", "Cardiff, Wales"])
    p = d.add_paragraph()
    p._p.append(parse_xml(f"<w:r {ns}><mc:AlternateContent><mc:Choice Requires=\"wps\"><w:drawing><wps:txbx><w:txbxContent>{box}</w:txbxContent></wps:txbx></w:drawing></mc:Choice>"
                          f"<mc:Fallback><w:pict><v:textbox><w:txbxContent>{box}</w:txbxContent></v:textbox></w:pict></mc:Fallback></mc:AlternateContent></w:r>"))
    d.add_heading("Profile", level=1)
    d.add_paragraph("Primary school teacher who makes maths the favourite lesson.")
    d.add_heading("Teaching Experience", level=1)
    d.add_paragraph("Year 4 Class Teacher, Example Primary School, Cardiff").runs[0].bold = True
    d.add_paragraph("September 2019 – Present")
    d.add_paragraph("Led maths across Key Stage 2.", style="List Bullet")
    d.add_heading("Education", level=1)
    d.add_paragraph("PGCE Primary, Example University, 2018 – 2019")
    d.save(HERE / "textbox.docx")


TEXT = {
    "caps-and-dashes.txt": """SAM OKAFOR
Product Designer
t: 07700 900456 | e: sam.okafor@example.com | linkedin.com/in/sam-okafor | Leeds, UK

PROFILE
Product designer with seven years shaping public-facing services.

WORK HISTORY
Fernleaf Digital — Lead Product Designer (2021 – Current)
• Led design for a booking service used by 2m people a year.
• Ran 40 rounds of user research.
Northwind Ltd — Product Designer (Mar 2018 – Jun 2021)
• Redesigned the checkout, lifting conversion by 12%.

EDUCATION
University of Leeds — BA (Hons) Graphic Design, 2:1 (2012 – 2015)

SKILLS
Design: Figma, Sketch, prototyping
Research: interviews, usability testing

LANGUAGES
English (native), French (fluent), Igbo – conversational

INTERESTS
Climbing, film photography, baking
""",
    "dates-first.txt": """Priya Natarajan
priya.n@example.org
+44 7700 900111
Bristol

Experience

2019 - Present    Senior Data Analyst, Example Health Trust, Bristol
Built the trust's first waiting-list forecast.
- Cut weekly reporting from two days to an hour.
- Trained 20 staff in SQL.

2016 - 2019    Data Analyst at Sample Insights Ltd
- Owned the monthly sales dashboard.

Qualifications
MSc Data Science
University of Bath
2015 - 2016
BSc Mathematics, University of Exeter, 2012 - 2015, First Class Honours

Programming Languages
Python
R
SQL
JavaScript

Certifications
AWS Certified Cloud Practitioner - Amazon Web Services - 2022
Tableau Desktop Specialist (Tableau) 2021
""",
    "stacked-headings.txt": """Tom Reyes
Software Engineer | tom@example.dev | github.com/tomreyes

Summary
I build backend services.

Employment
Software Engineer
Acme Payments Ltd, London
June 2020 - Present
Key achievements:
- Moved card processing to a new queue, cutting failures by 30%.
- Mentored two graduates.

Junior Developer
Brightside Studio
Sept 2018 - May 2020
Built client websites in PHP and Vue.

Technical Skills
• Go, Python, TypeScript
• PostgreSQL, Redis
• Docker, Kubernetes, Terraform

Education
BSc (Hons) Computer Science
Example University, 2015 – 2018
Grade: 2:1
""",
    "personal-details.txt": """Curriculum Vitae
Name: Morgan Lee
Address: 12 Example Road, Nottingham NG1 1AA
Mobile: 07700 900222
Email: morgan.lee@example.co.uk
Driving licence: Full, clean

Personal Statement
Reliable warehouse supervisor who keeps teams safe and orders moving.

Employment History
Sample Logistics Ltd, Nottingham
Shift Supervisor    Jan-2021 – Present
o Supervise a team of 14 pickers across nights.
o Cut mis-picks by 18% in six months.
Warehouse Operative    Jun-2018 – Dec-2020
o Picked and packed up to 300 orders a shift.

Example Retail (Seasonal)
Sales Assistant    Nov 2016 – Jan 2017
o Ran the till and handled returns.

Education & Qualifications
Example College, 2014 – 2016
BTEC Level 3 Extended Diploma in Business – Merit
GCSEs: 8 including English and Maths (grades 9–5)

Hobbies & Interests
Five-a-side football; volunteering at a food bank.

References
Available on request.
""",
    "one-line-roles.txt": """ALEX KOWALSKI
Senior Mechanical Engineer · Chartered (IMechE)
alex.kowalski@example.net · 07700 900333 · www.alexk.example.com · Derby

Mechanical engineer with twelve years in rail and aerospace, most recently leading design teams on bogie systems for new trains.

CAREER
SENIOR MECHANICAL ENGINEER – EXAMPLE RAIL SYSTEMS – DERBY – 2019 TO NOW
- Lead a team of 5 engineers designing bogie frames.
- Took a new suspension design from concept to type approval.

Mechanical Engineer, Sample Aero plc (Bristol)    Sep 2014 – Jun 2019
- Stress analysis of wing components in ANSYS.

Graduate Engineer
Sample Aero plc
2012 – 2014

VOLUNTEERING
STEM Ambassador, Example Science Centre, 2016 – present
- Run monthly workshops for local schools.

PROJECTS
Electric go-kart (2021) – github.com/alexk/go-kart
Built a 4 kW electric go-kart with my children.

EDUCATION
MEng Mechanical Engineering (First), Example University (2007–2012)

SKILLS
Proficient in: SolidWorks, ANSYS, MATLAB
Familiar with: Python, LabVIEW

CERTIFICATIONS
Chartered Engineer (CEng), IMechE, 2018
""",
    "us-style.txt": """JANE A. DOE
(555) 123-4567 | jane.doe@example.com | Austin, TX

E X P E R I E N C E

Acme Corp. (2019–2023)
Staff Accountant
➢ Closed the books monthly for three entities.
➢ Automated bank reconciliations in Excel.

Sample Partners Inc.
Junior Accountant, 2017 – 2019
✓ Prepared quarterly VAT returns.

2. Education ____
Example State University — B.S. Accounting, Expected 2016

3. Skills
Excel (Advanced), QuickBooks (Intermediate), SQL
""",
    "no-headings.txt": """Chris Mbeki
chris.mbeki@example.com
07700 900888

Senior Chef de Partie, The Example Kitchen, Manchester
March 2020 - Present
Run the pastry section for a 120-cover restaurant.
- Wrote the new dessert menu.

Chef de Partie, Sample Hotel Group, Liverpool
2017 - 2020
- Ran the grill on busy weekends.

Example College, Level 3 Diploma in Professional Cookery, 2015 - 2017
""",
}


if __name__ == "__main__":
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        fonts(pathlib.Path(tmp))
        sidebar_pdf(pathlib.Path(tmp))
        symbol_bullets_pdf()
        dates_left_pdf()
    header_contacts_docx()
    textbox_docx()
    table_layout_docx()
    for name, text in TEXT.items():
        (HERE / name).write_text(text)
    print("corpus written to", HERE)
