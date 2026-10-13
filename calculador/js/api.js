// Reemplaza a js/api.js del panel en el calculador público: no hay servidor que arme el PDF.
// La memoria se imprime desde el navegador ("Guardar como PDF"); el código 'print' le avisa a la pantalla.
export async function downloadMemoriaPdf() {
  const err = new Error('El PDF se guarda desde la ventana de impresión');
  err.code = 'print';
  throw err;
}
