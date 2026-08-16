export interface PreviewBlockMetrics {
  tableCount: number
  imageCount: number
  loadedImageCount: number
  codeBlockCount: number
  formulaCount: number
  displayFormulaCount: number
}

/** Counts layout-sensitive preview blocks without forcing offscreen geometry. */
export function collectPreviewBlockMetrics(root: HTMLElement): PreviewBlockMetrics {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
  return {
    tableCount: root.querySelectorAll('table').length,
    imageCount: images.length,
    loadedImageCount: images.filter((image) => {
      const localAsset = image.dataset.localAsset
      const currentSource = image.currentSrc || image.src
      return image.complete && image.naturalWidth > 0 && (!localAsset || currentSource === localAsset)
    }).length,
    codeBlockCount: root.querySelectorAll('.code-block').length,
    formulaCount: root.querySelectorAll('.katex').length,
    displayFormulaCount: root.querySelectorAll('.katex-display').length
  }
}
