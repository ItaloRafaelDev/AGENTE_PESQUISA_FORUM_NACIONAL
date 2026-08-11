export interface CpiActionControl {
  tag: string
  id: string
  className: string
  text: string
  href: string
  onclick: string
  formName: string
}

export function evaluateCpiActionControls(body: HTMLElement, selector: string): CpiActionControl[] {
  const controls = Array.from(body.querySelectorAll(selector))

  return controls.map((control) => {
    const htmlElement = control as HTMLElement
    const anchor = control as HTMLAnchorElement
    const form = control.closest('form')

    return {
      tag: control.tagName.toLowerCase(),
      id: htmlElement.id ?? '',
      className: typeof htmlElement.className === 'string' ? htmlElement.className : '',
      text: (control.textContent ?? '').replace(/\s+/g, ' ').trim(),
      href: anchor.getAttribute('href') ?? '',
      onclick: anchor.getAttribute('onclick') ?? '',
      formName: form?.getAttribute('name') ?? ''
    }
  })
}
