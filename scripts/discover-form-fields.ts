/**
 * Enumerate the real AcroForm fields on the DOR PDFs.
 *
 * A raw `strings` scan suggested UP-CDR2 exposes only ~14 text fields and that
 * UP-CDR4's are hidden inside compressed object streams. Neither is enough to
 * fill a form: UP-CDR2 §I alone lists up to 15 properties. pdf-lib decompresses
 * properly, so this is the authoritative inventory — and using the wrong form,
 * or filling it wrongly, VOIDS the claim under § 44-12-224(b).
 *
 *   pnpm discover:fields
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFSignature } from 'pdf-lib'

const ROOT = resolve(import.meta.dirname, '..')
const FORMS = ['UP-CDR1', 'UP-CDR2', 'UP-CDR3', 'UP-CDR4'] as const

interface FieldInfo {
  name: string
  type: string
  pageIndex: number | null
  rect: { x: number; y: number; width: number; height: number } | null
  maxLength?: number
  options?: string[]
}

interface FormInventory {
  form: string
  pageCount: number
  pageSizes: Array<{ width: number; height: number }>
  hasAcroForm: boolean
  fieldCount: number
  fields: FieldInfo[]
}

function fieldType(field: unknown): string {
  if (field instanceof PDFTextField) return 'text'
  if (field instanceof PDFCheckBox) return 'checkbox'
  if (field instanceof PDFDropdown) return 'dropdown'
  if (field instanceof PDFRadioGroup) return 'radio'
  if (field instanceof PDFSignature) return 'signature'
  return 'unknown'
}

async function inspect(form: string): Promise<FormInventory> {
  const bytes = readFileSync(join(ROOT, 'data/forms', `${form}.pdf`))
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const pages = pdf.getPages()

  let fields: FieldInfo[] = []
  let hasAcroForm = false

  try {
    const acro = pdf.getForm()
    const raw = acro.getFields()
    hasAcroForm = true

    fields = raw.map((field) => {
      const widgets = field.acroField.getWidgets()
      const widget = widgets[0]
      let pageIndex: number | null = null
      let rect: FieldInfo['rect'] = null

      if (widget !== undefined) {
        const r = widget.getRectangle()
        rect = { x: r.x, y: r.y, width: r.width, height: r.height }
        const widgetPage = widget.P()
        pageIndex = pages.findIndex((p) => p.ref === widgetPage)
        if (pageIndex === -1) pageIndex = null
      }

      const info: FieldInfo = {
        name: field.getName(),
        type: fieldType(field),
        pageIndex,
        rect,
      }
      if (field instanceof PDFTextField) {
        const max = field.getMaxLength()
        if (max !== undefined) info.maxLength = max
      }
      if (field instanceof PDFDropdown || field instanceof PDFRadioGroup) {
        info.options = field.getOptions()
      }
      return info
    })
  } catch {
    hasAcroForm = false
  }

  return {
    form,
    pageCount: pages.length,
    pageSizes: pages.map((p) => ({ width: p.getWidth(), height: p.getHeight() })),
    hasAcroForm,
    fieldCount: fields.length,
    fields,
  }
}

async function main(): Promise<void> {
  const inventories: FormInventory[] = []

  for (const form of FORMS) {
    const inventory = await inspect(form)
    inventories.push(inventory)

    console.log(`\n══ ${form} ══`)
    console.log(`  pages ${inventory.pageCount}  ·  ` +
      inventory.pageSizes.map((s) => `${Math.round(s.width)}×${Math.round(s.height)}`).join(', '))
    console.log(`  AcroForm: ${inventory.hasAcroForm}  ·  fields: ${inventory.fieldCount}`)

    if (inventory.fieldCount === 0) {
      console.log('  ⚠ NO FILLABLE FIELDS — this form must be filled by coordinate stamping.')
      continue
    }

    const byType = inventory.fields.reduce<Record<string, number>>((acc, f) => {
      acc[f.type] = (acc[f.type] ?? 0) + 1
      return acc
    }, {})
    console.log(`  by type: ${Object.entries(byType).map(([t, n]) => `${t}=${n}`).join(' ')}`)

    for (const field of inventory.fields) {
      const where = field.pageIndex === null ? 'no widget' : `p${field.pageIndex}`
      const at = field.rect === null ? '' :
        ` @(${Math.round(field.rect.x)},${Math.round(field.rect.y)}) ${Math.round(field.rect.width)}×${Math.round(field.rect.height)}`
      console.log(`    [${field.type}] ${field.name}  ${where}${at}`)
    }
  }

  const out = join(ROOT, 'data/seed/form-fields.json')
  writeFileSync(out, `${JSON.stringify(inventories, null, 2)}\n`)
  console.log(`\n✓ inventory written to ${out.replace(`${ROOT}/`, '')}`)
}

await main()
