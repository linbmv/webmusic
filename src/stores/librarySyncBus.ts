type LibraryChangeListener = () => void;

let listener: LibraryChangeListener | null = null;

export function onLibraryChanged(nextListener: LibraryChangeListener): () => void {
  const current = nextListener;
  listener = current;
  return () => {
    if (listener === current) listener = null;
  };
}

export function notifyLibraryChanged(): void {
  listener?.();
}
