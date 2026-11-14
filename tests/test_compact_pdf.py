import unittest

from bingo_generator import make_cards
from compact_pdf import render_pdf


class CompactPDFTest(unittest.TestCase):
    def test_12_cards_per_letter_page_and_determinism(self):
        cards = make_cards(13, 1234)
        self.assertEqual(cards, make_cards(13, 1234))
        self.assertEqual(len({tuple(v for row in c["grid"] for v in row) for c in cards}), 13)
        pdf = render_pdf(cards)
        self.assertTrue(pdf.startswith(b"%PDF-1.4"))
        self.assertIn(b"/Count 2", pdf)
        self.assertIn(b"/MediaBox [0 0 612 792]", pdf)
        self.assertEqual(pdf, render_pdf(cards))


if __name__ == "__main__":
    unittest.main()
