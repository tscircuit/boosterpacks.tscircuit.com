import type { HTMLAttributes } from "react"

type ModelViewerAttributes = HTMLAttributes<HTMLElement> & {
  src: string
  alt?: string
  "camera-controls"?: string
  "auto-rotate"?: string
  "auto-rotate-delay"?: string
  "rotation-per-second"?: string
  "shadow-intensity"?: string
  "shadow-softness"?: string
  exposure?: string
  "environment-image"?: string
  "interaction-prompt"?: string
  "touch-action"?: string
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes
    }
  }
}
