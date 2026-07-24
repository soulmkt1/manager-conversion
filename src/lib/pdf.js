// 대쉬보드 화면을 캡처해 PDF 파일로 즉시 다운로드
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export async function exportDashboardPDF(element) {
  if (!element) throw new Error('대상 화면을 찾을 수 없습니다.')

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#f4f6fb',
    useCORS: true,
    // 상단 컨트롤(필터·PDF 버튼)은 PDF에서 제외
    ignoreElements: (el) => el.classList && el.classList.contains('head-controls'),
  })

  // JPEG로 압축해 파일 크기를 줄임 (PNG는 수십 MB가 될 수 있음)
  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW
  const imgH = (canvas.height * imgW) / canvas.width

  let heightLeft = imgH
  let position = 0
  pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
  heightLeft -= pageH
  while (heightLeft > 0) {
    position -= pageH
    pdf.addPage()
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
    heightLeft -= pageH
  }

  const today = new Date().toISOString().slice(0, 10)
  pdf.save(`대쉬보드_${today}.pdf`)
}
