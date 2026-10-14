"""Build the review pack. Requires reportlab, svglib and rendered diagrams."""
from pathlib import Path
import re
from html import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether, PageBreak
from reportlab.pdfgen import canvas
from reportlab.graphics import renderPDF
from svglib.svglib import svg2rlg

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/pdf'
OUT.mkdir(parents=True, exist_ok=True)
FONT = Path('/usr/share/fonts/truetype/dejavu')
pdfmetrics.registerFont(TTFont('Body', str(FONT / 'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('BodyBold', str(FONT / 'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='BodyBold', italic='Body', boldItalic='BodyBold')
NAVY = colors.HexColor('#203b60')
TEAL = colors.HexColor('#197d85')
GRAY = colors.HexColor('#58687a')
styles = getSampleStyleSheet()
styles.add(ParagraphStyle('TitleHMS', fontName='BodyBold', fontSize=23, leading=29, textColor=NAVY, spaceAfter=12))
styles.add(ParagraphStyle('SectionHMS', fontName='BodyBold', fontSize=12, leading=17, textColor=TEAL, spaceBefore=14, spaceAfter=7, keepWithNext=True))
styles.add(ParagraphStyle('BodyHMS', fontName='Body', fontSize=10, leading=15, textColor=colors.HexColor('#203040'), spaceAfter=9, alignment=TA_LEFT, allowWidows=0, allowOrphans=0))
styles.add(ParagraphStyle('ListHMS', parent=styles['BodyHMS'], leftIndent=15, firstLineIndent=-12, spaceAfter=8))
styles.add(ParagraphStyle('SmallHMS', parent=styles['BodyHMS'], fontSize=8, leading=12, textColor=GRAY))


def clean(text):
    return text.translate(str.maketrans({'—': '-', '–': '-', '‑': '-', '’': "'", '“': '"', '”': '"', '→': '>', '…': '...'}))


def inline(text):
    text = escape(clean(text))
    text = re.sub(r'`([^`]+)`', r'<font color="#245b7b">\1</font>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', text)
    return text


def footer(c, doc):
    w, h = doc.pagesize
    c.saveState()
    c.setStrokeColor(colors.HexColor('#c5d5e4'))
    c.line(48, 42, w-48, 42)
    c.setFont('Body', 8)
    c.setFillColor(GRAY)
    c.drawString(48, 28, 'Smart HMS  |  E2340248  |  Review draft - 13 October 2026')
    c.drawRightString(w-48, 28, str(doc.page))
    c.restoreState()


def document(source, filename, title):
    content = (ROOT / source).read_text().strip().split('\n\n')
    story = [Paragraph('PROJECT REVIEW PACK', styles['SmallHMS']), Paragraph(title, styles['TitleHMS'])]
    for block in content:
        block = block.strip()
        if block.startswith('# '):
            continue
        if block.startswith('## '):
            if source.endswith('user-manual.md') and block[3:] in ['Patient workflow', 'Doctor workflow']:
                story.append(PageBreak())
            story.append(Paragraph(inline(block[3:]), styles['SectionHMS']))
        elif re.match(r'^(\d+\. |\- )', block):
            for line in block.splitlines():
                line = line.strip()
                if line.startswith('- '):
                    line = '\u2022 ' + line[2:]
                story.append(KeepTogether([Paragraph(inline(line), styles['ListHMS'])]))
        else:
            story.append(Paragraph(inline(block.replace('\n', ' ')), styles['BodyHMS']))
    doc = SimpleDocTemplate(str(OUT / filename), pagesize=A4, rightMargin=48, leftMargin=48, topMargin=42, bottomMargin=57, title=title, author='M.M. Rajaab Ahmed - E2340248', subject='Implementation review draft; external and human acceptance pending')
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def diagrams():
    target = OUT / 'Smart-HMS-Use-Case-Diagrams.pdf'
    c = canvas.Canvas(str(target))
    c.setTitle('Smart HMS - revised use case diagrams')
    c.setAuthor('M.M. Rajaab Ahmed - E2340248')
    figures = [
        ('01-public', 'Public access', 'Public information requires publication. Registration is patient-only. Recovery links are single-use and expire after 15 minutes; actual SMTP delivery remains pending.'),
        ('02-patient', 'Patient workspace', 'Authentication and ownership apply to protected actions. Feedback requires a completed visit. Dashed include arrows identify mandatory internal behaviour. Guidance remains an English keyword prototype, not a diagnosis.'),
        ('03-care-team', 'Care team', 'Doctors access assigned clinical records. Completion atomically publishes the record, creates the bill and stores notifications. Staff record payments received outside the application; no card payment is processed.'),
        ('04-administration', 'Administration', 'Deactivation preserves history and requires open visits to be resolved. Public doctor profiles require explicit approval. Administrative roles do not gain general access to confidential clinical notes.'),
    ]
    for number, (name, title, caption) in enumerate(figures, 1):
        drawing = svg2rlg(str(ROOT / f'docs/diagrams/{name}.svg'))
        size = landscape(A4) if drawing.width / drawing.height > 1.1 else A4
        c.setPageSize(size)
        w, h = size
        box_w, box_h = w-80, h-172
        scale = min(box_w/drawing.width, box_h/drawing.height)
        drawing.scale(scale, scale)
        drawing.width *= scale
        drawing.height *= scale
        renderPDF.draw(drawing, c, (w-drawing.width)/2, h-77-drawing.height)
        c.setFillColor(NAVY)
        c.setFont('BodyBold', 20)
        c.drawString(40, h-42, f'{number:02d}  {title}')
        c.setFont('Body', 8)
        c.setFillColor(GRAY)
        c.drawString(40, h-58, 'SMART HMS  |  UML USE CASE VIEW  |  IMPLEMENTED BEHAVIOUR')
        p = Paragraph(inline(caption), styles['SmallHMS'])
        _, ph = p.wrap(w-80, 58)
        p.drawOn(c, 40, 51 + max(0, 48-ph))
        c.setStrokeColor(colors.HexColor('#c5d5e4'))
        c.line(40, 40, w-40, 40)
        c.setFont('Body', 7.5)
        c.drawString(40, 26, 'E2340248  |  13 October 2026  |  Actor boxes are outside the system boundary')
        c.drawRightString(w-40, 26, str(number))
        c.showPage()
    c.save()


document('docs/implementation-report.md', 'Smart-HMS-Implementation-Report-Draft.pdf', 'Smart HMS\nImplementation report draft'.replace('\n', '<br/>'))
document('docs/user-manual.md', 'Smart-HMS-User-Manual.pdf', 'Smart HMS<br/>User manual')
diagrams()
print('Created implementation report, user manual and four-page diagram PDF.')
