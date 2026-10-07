// Caps lock is a display style: the typing field shows the text in capitals
// (so its caret lines up with the capitals the mirror draws) while the
// element keeps the text as typed, and the caps button can undo it.
//
// An edit to the shown (capitalised) text is mapped back onto the typed
// text: what is unchanged at either end keeps its typed case, and only the
// changed middle comes from the field.
export const shownText = (typed: string, caps: boolean) => (caps ? typed.toUpperCase() : typed);

export function typedAfterEdit(typed: string, edited: string, caps: boolean): string {
  if (!caps) return edited;
  const shown = typed.toUpperCase();
  // a letter that capitalises to two (ß -> SS) shifts every position after
  // it; keep the field's text rather than guess
  if (shown.length !== typed.length) return edited;
  let start = 0;
  while (start < shown.length && start < edited.length && shown[start] === edited[start]) start++;
  let end = 0;
  while (
    end < shown.length - start && end < edited.length - start
    && shown[shown.length - 1 - end] === edited[edited.length - 1 - end]
  ) end++;
  return typed.slice(0, start) + edited.slice(start, edited.length - end) + typed.slice(typed.length - end);
}
