import { ReactNode } from 'react'

interface GalleryProps {
  children: ReactNode
}

export default function Gallery({ children }: GalleryProps) {
  return (
    <div className="grid sm:grid-cols-3 gap-4 mt-6">
      {children}
    </div>
  )
}
