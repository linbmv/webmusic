type LibraryChangeListener = () => void;

const listeners = new Set<LibraryChangeListener>();

export function onLibraryChanged(listener: LibraryChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyLibraryChanged(): void {
  listeners.forEach((listener) => listener());
}
