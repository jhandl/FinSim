import fitz  # PyMuPDF
import sys

def extract_text_to_markup(pdf_path, output_path):
    try:
        # Open the PDF file
        document = fitz.open(pdf_path)
        
        # Prepare the output file
        with open(output_path, 'w', encoding='utf-8') as output_file:
            output_file.write("<document>\n")

            # Iterate over all pages in the PDF
            for page_number in range(document.page_count):
                page = document.load_page(page_number)
                text = page.get_text()

                # Write page text with markup
                output_file.write(f"  <page number=\"{page_number + 1}\">\n")
                output_file.write(text)
                output_file.write("  </page>\n")
            
            output_file.write("</document>\n")
        
        print(f"Successfully extracted PDF text to: {output_path}")
    except Exception as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python extract_pdf.py <input_pdf_path> <output_markup_path>")
    else:
        input_pdf_path = sys.argv[1]
        output_markup_path = sys.argv[2]
        extract_text_to_markup(input_pdf_path, output_markup_path)

