/** Request a styled, accessible confirmation dialog from the global dialog host. */
export function confirmAction(message) {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent('asems:confirm', {
      detail: { message: String(message ?? 'Are you sure?',), resolve },
    }));
  });
}
