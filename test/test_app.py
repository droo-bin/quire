"""Browser tests for the built app (run `node scripts/build.mjs` first).

    python3 -m unittest discover -s test -p "test_*.py" -v

Serves dist/ on a local port, opens it in Chromium and uses it the way a person would.
"""
import base64
import functools
import http.server
import json
import pathlib
import tempfile
import threading
import unittest

from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
FIXTURES = ROOT / "test" / "fixtures"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(Quiet, directory=str(DIST))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# Text of a PDF (as bytes) using the app's own pdf.js, plus its attachment if any.
PDF_TEXT = """async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', location.href).href;
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    text += c.items.map((it) => it.str + (it.hasEOL ? '\\n' : '')).join('') + '\\n';
  }
  const att = await doc.getAttachments();
  const out = { text, pages: doc.numPages, attachments: att ? [...att.keys()] : [] };
  await task.destroy();
  return out;
}"""


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = serve()
        cls.url = f"http://127.0.0.1:{cls.server.server_address[1]}/"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()

    def setUp(self):
        self.ctx = self.browser.new_context(viewport={"width": 1400, "height": 900}, locale="en-GB", accept_downloads=True)
        self.page = self.ctx.new_page()
        self.errors = []
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.on("console", lambda m: self.errors.append(m.text) if m.type == "error" else None)

    def tearDown(self):
        self.ctx.close()
        self.assertEqual(self.errors, [], "no errors in the page")

    def open(self, query="?nosw"):
        self.page.goto(self.url + query)
        expect(self.page.get_by_role("button", name="Try an example")).to_be_visible()

    def example(self):
        self.open()
        self.page.get_by_role("button", name="Try an example").click()
        self.wait_preview()

    def wait_preview(self):
        self.page.wait_for_function("() => document.querySelector('#pages .page') && window.quire.pages > 0")
        self.page.wait_for_timeout(350)

    def doc(self):
        return self.page.evaluate("window.quire.doc")

    def preview_text(self):
        self.page.wait_for_timeout(400)
        return self.page.locator("#pages").inner_text()

    def import_file(self, name):
        sel = "#import-home" if self.page.locator("#import-home").count() else "#import-bar"
        self.page.set_input_files(sel, str(FIXTURES / name))
        self.wait_preview()

    def download(self, item):
        with self.page.expect_download() as dl:
            self.page.get_by_role("button", name="Download", exact=True).click()
            self.page.get_by_role("menuitem", name=item).click()
        path = pathlib.Path(tempfile.mkdtemp()) / dl.value.suggested_filename
        dl.value.save_as(path)
        return path


class Editing(Base):
    def test_example_renders_and_edits_flow_to_the_preview(self):
        self.example()
        self.assertIn("Priya Shah", self.preview_text())
        name = self.page.get_by_label("Full name")
        name.fill("Priya K. Shah")
        self.page.wait_for_timeout(400)
        self.assertIn("Priya K. Shah", self.preview_text())
        # Saved in the browser: a reload brings it back.
        self.page.wait_for_timeout(500)
        self.page.reload()
        self.wait_preview()
        self.assertEqual(self.doc()["resume"]["basics"]["name"], "Priya K. Shah")

    def test_bullets_split_join_paste_and_undo(self):
        self.example()
        self.page.locator(".entry-card[data-path='work.1'] .entry-toggle").click()
        box = self.page.locator("[data-field='work.1.highlights.0']")
        box.click()
        box.press("Control+End")
        box.press("Enter")
        self.page.locator("[data-field='work.1.highlights.1']").type("Shipped a new pricing page.")
        self.page.wait_for_timeout(300)
        hl = self.doc()["resume"]["work"][1]["highlights"]
        self.assertEqual(hl[1], "Shipped a new pricing page.")
        self.assertEqual(len(hl), 4)
        # Pasting several lines makes several points.
        self.page.locator("[data-field='work.1.highlights.1']").press("Control+End")
        self.page.evaluate("""() => { const t = document.querySelector("[data-field='work.1.highlights.1']"); const dt = new DataTransfer(); dt.setData('text/plain', '\\n• One\\n• Two'); t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
        self.page.wait_for_timeout(200)
        hl = self.doc()["resume"]["work"][1]["highlights"]
        self.assertEqual(hl[1:4], ["Shipped a new pricing page.", "One", "Two"])
        # Undo (outside a text box) steps back.
        self.page.locator(".preview-bar").click()
        self.page.keyboard.press("Control+z")
        self.page.wait_for_timeout(200)
        self.assertEqual(len(self.doc()["resume"]["work"][1]["highlights"]), 4)
        self.page.get_by_role("button", name="Redo").click()
        self.assertEqual(len(self.doc()["resume"]["work"][1]["highlights"]), 6)

    def test_hide_reorder_and_delete_entries(self):
        self.example()
        self.assertIn("Associate Product Manager", self.preview_text())
        self.page.locator(".entry-card[data-path='work.2'] .entry-actions button").first.click()
        self.assertNotIn("Associate Product Manager", self.preview_text())
        self.assertTrue(self.doc()["hidden"].get("work.2"))
        # Move with the keyboard: focus the grip of the first job and press down.
        self.page.locator(".entry-card[data-path='work.0'] .grip").focus()
        self.page.keyboard.press("ArrowDown")
        self.page.wait_for_timeout(200)
        work = self.doc()["resume"]["work"]
        self.assertEqual([w["position"] for w in work], ["Product Manager", "Senior Product Manager", "Associate Product Manager"])
        self.assertTrue(self.doc()["hidden"].get("work.2"), "hidden flag stays with its entry")
        # Delete, then undo from the toast.
        self.page.locator(".entry-card[data-path='work.0'] .entry-actions button").nth(1).click()
        self.page.get_by_role("menuitem", name="Delete").click()
        self.assertEqual(len(self.doc()["resume"]["work"]), 2)
        self.page.locator("#toast").get_by_role("button", name="Undo").click()
        self.assertEqual(len(self.doc()["resume"]["work"]), 3)

    def test_drag_a_section(self):
        self.example()
        ids = lambda: [x for x in self.doc()["layout"]["order"]]
        before = ids()
        src = self.page.locator(".sec[data-path='section:education'] .card-h .grip")
        dst = self.page.locator(".sec[data-path='section:work']")
        src.scroll_into_view_if_needed()
        sb, db = src.bounding_box(), dst.bounding_box()
        self.page.mouse.move(sb["x"] + 5, sb["y"] + 5)
        self.page.mouse.down()
        self.page.mouse.move(db["x"] + 20, db["y"] + 10, steps=8)
        self.page.mouse.up()
        self.page.wait_for_timeout(300)
        after = ids()
        self.assertLess(after.index("education"), after.index("work"))
        self.assertNotEqual(before, after)
        text = self.preview_text()
        self.assertLess(text.index("EDUCATION"), text.index("EXPERIENCE"))

    def test_add_sections_and_click_preview_to_edit(self):
        self.example()
        self.page.get_by_role("button", name="Add a section").click()
        self.page.get_by_role("menuitem", name="Projects").click()
        self.page.get_by_label("Project", exact=True).fill("Allotment rota app")
        self.page.wait_for_timeout(300)
        self.assertIn("Allotment rota app", self.preview_text())
        self.page.get_by_role("button", name="Add a section").click()
        self.page.get_by_role("menuitem", name="A section of your own…").click()
        self.page.locator(".sec .title-input").last.fill("Speaking")
        self.page.locator(".sec").last.get_by_label("Title", exact=True).fill("Opening talk at Product Camp")
        self.page.wait_for_timeout(300)
        self.assertIn("SPEAKING", self.preview_text())
        # Clicking a bullet in the preview opens it in the editor.
        self.page.locator("#pages li[data-path='work.1.highlights.0']").click()
        expect(self.page.locator("[data-field='work.1.highlights.0']")).to_be_focused()

    def test_dates_are_understood_and_present_checkbox(self):
        self.example()
        self.page.locator(".entry-card[data-path='work.1'] .entry-toggle").click()
        start = self.page.locator("[data-field='work.1.startDate']")
        start.fill("feb 2018")
        self.page.wait_for_timeout(250)
        self.assertEqual(self.doc()["resume"]["work"][1]["startDate"], "2018-02")
        start.fill("whenever")
        self.page.wait_for_timeout(200)
        expect(self.page.locator(".date-note.bad")).to_be_visible()
        start.fill("2018")
        self.page.locator(".entry-card[data-path='work.1'] .field.date .check input").last.check()
        self.page.wait_for_timeout(250)
        self.assertEqual(self.doc()["resume"]["work"][1]["endDate"], "")
        self.assertIn("2018 – Present", self.preview_text())


    def test_unticking_ongoing_lets_you_type_an_end_date(self):
        self.example()
        self.page.locator(".entry-card[data-path='work.0'] .entry-toggle").click()
        end = self.page.locator("[data-field='work.0.endDate']")
        expect(end).to_be_disabled()
        self.page.locator(".entry-card[data-path='work.0'] .field.date .check input").last.uncheck()
        expect(end).to_be_enabled()
        expect(end).to_be_focused()
        end.fill("Jun 2025")
        self.page.wait_for_timeout(250)
        self.assertEqual(self.doc()["resume"]["work"][0]["endDate"], "2025-06")
        self.assertIn("Apr 2022 – Jun 2025", self.preview_text())


class Design(Base):
    def test_templates_fonts_colours_and_fit(self):
        self.example()
        self.page.get_by_role("tab", name="Design").click()
        expect(self.page.locator(".thumb .page")).to_have_count(6, timeout=8000)
        for t in ["Classic", "Sidebar", "Compact", "Banner", "Timeline", "Modern"]:
            self.page.get_by_role("radio", name=t).click()
            self.page.wait_for_timeout(250)
            self.assertIn("t-" + t.lower(), self.page.locator("#pages .cv").get_attribute("class"))
        self.page.locator("#font").select_option("caladea")
        self.page.get_by_role("radio", name="Teal").click()
        self.page.wait_for_timeout(300)
        style = self.page.locator("#pages .cv").get_attribute("style")
        self.assertIn("Quire Caladea", style)
        self.assertIn("#0f6b66", style)
        # Make it long, then fit it to one page.
        self.page.evaluate("""() => window.quire.edit((d) => { for (let i = 0; i < 4; i++) d.resume.work.push(JSON.parse(JSON.stringify(d.resume.work[0]))); }, { refresh: true })""")
        self.page.wait_for_timeout(500)
        self.assertGreater(self.page.evaluate("window.quire.pages"), 1)
        self.page.get_by_role("radio", name="1 page").click()
        self.page.wait_for_timeout(900)
        self.assertEqual(self.page.evaluate("window.quire.pages"), 1)
        self.assertIn("Shrunk to", self.page.locator(".fit-note").inner_text())

    def test_sidebar_sections_can_move_columns(self):
        self.example()
        self.page.get_by_role("tab", name="Design").click()
        self.page.get_by_role("radio", name="Sidebar").click()
        self.page.wait_for_timeout(300)
        self.assertEqual(self.page.locator("#pages .region.side .sec-h", has_text="Skills").count(), 1)
        self.page.get_by_role("radiogroup", name="Column for Skills").get_by_role("radio", name="Main").click()
        self.page.wait_for_timeout(300)
        self.assertEqual(self.page.locator("#pages .region.main .sec-h", has_text="Skills").count(), 1)

    def test_long_cv_breaks_between_bullets_and_keeps_headings_with_entries(self):
        self.example()
        self.page.evaluate("""() => window.quire.edit((d) => {
          for (let i = 0; i < 6; i++) d.resume.work.push({ ...JSON.parse(JSON.stringify(d.resume.work[1])), highlights: Array.from({ length: 6 }, (_, k) => 'Point number ' + (k + 1) + ' about a thing that went well and was measured carefully.') });
        }, { refresh: true })""")
        self.page.wait_for_timeout(700)
        pages = self.page.locator("#pages .page")
        self.assertGreaterEqual(pages.count(), 2)
        overflow = self.page.evaluate("""() => [...document.querySelectorAll('#pages .region')].filter(r => r.scrollHeight > r.clientHeight + 1).length""")
        self.assertEqual(overflow, 0, "nothing runs off a page")
        dangling = self.page.evaluate("""() => [...document.querySelectorAll('#pages .region')].filter(r => r.lastElementChild && r.lastElementChild.classList.contains('sec-h')).length""")
        self.assertEqual(dangling, 0, "no heading alone at the bottom of a page")


class Review(Base):
    def test_checks_and_fixes(self):
        self.example()
        self.page.get_by_role("tab", name="Review").click()
        check = self.page.locator(".check", has_text='not "Responsible for"')
        expect(check).to_be_visible()
        check.get_by_role("button", name="Show me").click()
        expect(self.page.locator("[data-field='work.0.highlights.2']")).to_be_focused()
        # A fixable check: make a past job present tense, then fix it.
        self.page.evaluate("""() => window.quire.edit((d) => { d.resume.work[1].highlights[0] = 'Launch subscription pausing.'; }, { refresh: true })""")
        self.page.get_by_role("tab", name="Review").click()
        self.page.wait_for_timeout(400)
        self.page.get_by_role("button", name='Change to "Launched"').click()
        self.assertEqual(self.doc()["resume"]["work"][1]["highlights"][0], "Launched subscription pausing.")
        # Ignoring a check hides it.
        n = self.page.locator(".check").count()
        self.page.locator(".check").first.get_by_role("button", name="Ignore").click()
        self.assertEqual(self.page.locator(".check").count(), n - 1)

    def test_job_matching_and_tailored_copy(self):
        self.example()
        self.page.get_by_role("tab", name="Review").click()
        self.page.locator("#job-text").fill("Senior Product Manager\nEssential: user research, SQL, A/B testing, stakeholder management and Kubernetes.\nYou will have experience with Jira and Figma.")
        self.page.wait_for_timeout(300)
        expect(self.page.locator(".match-sum")).to_contain_text("%")
        missing = self.page.locator(".chip.miss", has_text="Kubernetes")
        expect(missing).to_be_visible()
        missing.get_by_role("button").click()
        self.assertIn("Kubernetes", self.doc()["resume"]["skills"][0]["keywords"])
        self.page.get_by_role("button", name="Make a copy for this job").click()
        self.page.wait_for_timeout(600)
        self.assertIn("Senior Product Manager", self.doc()["name"])
        docs = self.page.evaluate("async () => (await (await import('./lib/store.js')).listDocs()).length")
        self.assertEqual(docs, 2)

    def test_local_model_with_a_stand_in_engine(self):
        self.example()
        self.page.evaluate("""async () => { const llm = await import('./lib/llm.js'); llm.useEngine({ chat: async (messages, o) => { const last = messages[messages.length - 1].content; const out = last.startsWith('Job:') ? 'Cut monthly cancellations by 23% by launching subscription pausing' : '1. Quote: "Responsible for the product roadmap" – say what changed.'; if (o.onText) o.onText(out.slice(0, 10)); return out; } }, 'test engine'); }""")
        self.page.get_by_role("tab", name="Review").click()
        self.page.get_by_role("button", name="Review my CV").click()
        expect(self.page.locator(".ai-text")).to_contain_text("Responsible for the product roadmap")
        self.page.get_by_role("tab", name="Content").click()
        self.page.locator(".entry-card[data-path='work.1'] .entry-toggle").click()
        self.page.locator("[data-field='work.1.highlights.0']").locator("xpath=..").get_by_role("button", name="Suggest a stronger version (local model)").click()
        self.page.get_by_role("button", name="Use this").click()
        self.assertEqual(self.doc()["resume"]["work"][1]["highlights"][0], "Cut monthly cancellations by 23% by launching subscription pausing")


class ImportExport(Base):
    def test_imports_a_word_cv(self):
        self.open()
        self.import_file("word-cv.docx")
        expect(self.page.get_by_role("dialog", name="Imported")).to_be_visible()
        d = self.doc()["resume"]
        self.assertEqual(d["basics"]["name"], "Jordan Ellis")
        self.assertEqual(d["basics"]["label"], "Registered Nurse")
        self.assertEqual([w["position"] for w in d["work"]], ["Senior Staff Nurse", "Staff Nurse"])
        self.assertEqual(d["work"][0]["name"], "Northside General Hospital")
        self.assertEqual(d["work"][1]["endDate"], "2021-04")
        self.assertEqual(len(d["work"][0]["highlights"]), 2)
        self.assertEqual(d["education"][0]["score"], "First Class Honours")
        self.assertEqual([s["name"] for s in d["skills"]], ["Clinical", "Systems"])

    def test_imports_a_two_column_pdf(self):
        self.open()
        self.import_file("two-column.pdf")
        d = self.doc()["resume"]
        b = d["basics"]
        self.assertEqual((b["name"], b["label"], b["email"], b["location"]["city"]), ("Alex Morgan", "UX Designer", "alex.morgan@example.net", "Glasgow"))
        self.assertEqual(b["profiles"][0]["url"], "https://linkedin.com/in/alexmorgan-example")
        self.assertEqual([(w["position"], w["name"]) for w in d["work"]], [("Lead UX Designer", "Thistle Digital"), ("UX Designer", "Lanark Retail Group")])
        self.assertEqual(d["work"][1]["startDate"], "2016-03")
        self.assertEqual(len(d["education"]), 2)
        self.assertEqual(d["skills"][0]["keywords"][:2], ["Figma", "User research"])

    def test_imports_linkedin_fresh_reactive_and_text(self):
        self.open()
        self.import_file("linkedin-export.zip")
        d = self.doc()["resume"]
        self.assertEqual(d["basics"]["name"], "Sam Okafor")
        self.assertEqual(d["work"][0]["highlights"], ["Built the payments API in Go.", "Cut p99 latency by 40%."])
        for name, who in [("fresh.json", "Robin Hart"), ("reactive.json", "Casey Lin"), ("sample-cv.txt", "Sam Taylor")]:
            self.page.evaluate("() => document.querySelectorAll('dialog').forEach((d) => d.close())")
            self.page.set_input_files("#import-bar", str(FIXTURES / name))
            self.page.wait_for_function(f"() => window.quire.doc.resume.basics.name === {json.dumps(who)}")

    def test_pdf_export_is_real_text_and_imports_back_exactly(self):
        self.example()
        self.page.evaluate("() => window.quire.edit((d) => { d.layout.template = 'sidebar'; d.hidden['work.2'] = true; }, { refresh: true })")
        path = self.download("PDF")
        data = path.read_bytes()
        self.assertTrue(data.startswith(b"%PDF-1.7"))
        info = self.page.evaluate(PDF_TEXT, base64.b64encode(data).decode())
        self.assertEqual(info["attachments"], ["resume.json"])
        text = info["text"]
        for phrase in ["Priya Shah", "Senior Product Manager", "Led a team of 9 rebuilding a city council", "priya.shah@example.com", "SUMMARY"]:
            self.assertIn(phrase, text)
        self.assertNotIn("Associate Product Manager", text, "hidden entries stay out")
        # Importing the PDF brings back the whole CV, hidden job and template included.
        self.page.set_input_files("#import-bar", str(path))
        self.page.wait_for_function("() => window.quire.doc && window.quire.doc.layout.template === 'sidebar' && window.quire.past.length === 0")
        d = self.doc()
        self.assertEqual(len(d["resume"]["work"]), 3)
        self.assertTrue(d["hidden"].get("work.2"))
        expect(self.page.locator("#toast")).to_contain_text("exactly")

    def test_pdf_export_copes_with_odd_links_and_hidden_sections(self):
        self.example()
        self.page.evaluate("() => window.quire.edit((d) => { d.resume.basics.url = 'shop.example.com/50%off'; d.layout.hiddenSections = { interests: true }; }, { refresh: true })")
        data = self.download("PDF").read_bytes()
        text = self.page.evaluate(PDF_TEXT, base64.b64encode(data).decode())["text"]
        self.assertIn("shop.example.com/50%off", text)
        self.assertNotIn("Allotment growing", text)
        self.assertNotIn("Allotment growing", self.download("Plain text").read_text())

    def test_word_json_and_text_exports(self):
        self.example()
        docx = self.download("Word (.docx)")
        self.assertTrue(docx.read_bytes().startswith(b"PK"))
        self.page.set_input_files("#import-bar", str(docx))
        self.page.wait_for_function("() => window.quire.doc && window.quire.doc.resume.work.length === 3 && window.quire.doc.created > Date.now() - 5000")
        d = self.doc()["resume"]
        self.assertEqual(d["basics"]["name"], "Priya Shah")
        self.assertEqual(d["work"][0]["position"], "Senior Product Manager")
        self.assertEqual(d["work"][0]["name"], "Harbourside Digital")
        self.assertEqual(len(d["work"][0]["highlights"]), 3)
        self.page.get_by_role("button", name="Start editing").click()
        js = json.loads(self.download("JSON Resume").read_text())
        self.assertEqual(js["basics"]["name"], "Priya Shah")
        self.assertIn("quire", js["meta"])
        txt = self.download("Plain text").read_text()
        self.assertTrue(txt.startswith("PRIYA SHAH"))
        self.assertIn("• Launched subscription pausing", txt)


class Places(Base):
    def test_phone_layout(self):
        self.ctx.close()
        self.ctx = self.browser.new_context(viewport={"width": 390, "height": 844}, locale="en-GB", has_touch=True, is_mobile=True)
        self.page = self.ctx.new_page()
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.example()
        self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), 391)
        expect(self.page.locator(".preview")).to_be_hidden()
        self.page.get_by_role("button", name="Preview").click()
        expect(self.page.locator(".preview")).to_be_visible()
        self.page.wait_for_timeout(300)
        w = self.page.locator("#pages").bounding_box()["width"]
        self.assertLessEqual(w, 390)
        self.page.locator("#pages li").first.click()
        expect(self.page.locator(".panel-wrap")).to_be_visible()

    def test_works_offline_once_loaded(self):
        self.open("")
        self.page.evaluate("async () => { await navigator.serviceWorker.ready; }")
        self.page.reload()
        self.page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=20000)
        self.page.wait_for_function("async () => (await caches.keys()).some((k) => k.startsWith('quire-'))", timeout=20000)
        self.ctx.set_offline(True)
        self.page.reload()
        self.page.get_by_role("button", name="Try an example").click()
        self.wait_preview()
        self.assertIn("Priya Shah", self.preview_text())


if __name__ == "__main__":
    unittest.main()
