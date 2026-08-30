---
mode: testing
timeout: 600
url: http://localhost:3000/deck/demo
---

# Tutorial Slides — New Developer Onboarding

## Open deck and verify cover

Open http://localhost:3000/deck/demo, assert the heading "Unikane" is visible, assert no console errors.

## Click through architecture slides

Click the Next button, assert the heading contains "Architecture", assert the diagram with 3 layers is visible. Click Next, assert the heading contains "Key Flows".

## Verify TAM calculator interactivity

Store the TAM calculator value as 'tam_before', fill the input with "200", assert the TAM value not equals "{{tam_before}}", assert the calculator displays a value greater than 0.

## Verify marketing one-pager

Navigate to http://localhost:3000/deck/demo/one-pager, assert the hero title is visible, assert the comparison table has 5 rows, assert no API calls returned 5xx, assert page LCP is under 2500ms.

## Verify export

Assert the "Export PDF" button is visible, click the "Export PDF" button, assert no console errors after clicking.
