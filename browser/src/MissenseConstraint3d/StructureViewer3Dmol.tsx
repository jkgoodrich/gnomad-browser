import { createViewer, GLModel, GLViewer } from '3dmol'
import React, { Component } from 'react'
import styled from 'styled-components'

import StatusMessage from '../StatusMessage'
import {
  CONFIDENT_PLDDT,
  NO_REGION_COLOR,
  ResidueRange,
  STRUCTURE_HIGHLIGHT_COLOR,
  STRUCTURE_VIEWER_STATUS_MESSAGES,
  StructureViewerProps,
  StructureViewerStatus,
  residueNamesMatchSequence,
} from './missenseConstraint3d'

type Atom = {
  resi: number
  resn: string
  b: number
}

const HOVER_DELAY_MS = 50
// At an overlay size of 1
const VARIANT_SPHERE_RADIUS = 1.5
const FEATURE_STICK_RADIUS = 0.25

const ViewerContainer = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`

const StatusOverlay = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  justify-content: center;
  align-items: center;
`

// A predicate on a set of residues is much faster than 3Dmol's "start-stop" residue range strings,
// which it parses again for every atom
const residueSelection = (residueRanges: ResidueRange[]) => {
  const residues = new Set(
    residueRanges.flatMap(([start, stop]) =>
      Array.from({ length: stop - start + 1 }, (_, i) => start + i)
    )
  )
  return { predicate: (atom: { resi?: number }) => residues.has(atom.resi!) }
}

const confidentAtoms = { predicate: (atom: { b?: number }) => (atom.b ?? 0) >= CONFIDENT_PLDDT }

const frameConfidentResidues = (viewer: GLViewer) => {
  viewer.zoomTo(viewer.selectedAtoms(confidentAtoms).length > 0 ? confidentAtoms : {})
}

type State = {
  status: StructureViewerStatus
}

class StructureViewer3Dmol extends Component<StructureViewerProps, State> {
  container: HTMLDivElement | null = null

  viewer: GLViewer | null = null

  // 3Dmol rebuilds all of a model's geometry when any of its styles change, so overlays are drawn
  // from a second copy of the structure to restyle them without rebuilding the cartoon
  cartoonModel: GLModel | null = null

  overlayModel: GLModel | null = null

  isUnmounted = false

  constructor(props: StructureViewerProps) {
    super(props)
    this.state = { status: 'loading' }
  }

  componentDidMount() {
    window.addEventListener('resize', this.onResize)
    this.loadStructure().catch((error) => {
      console.error(`failed to load structure: "${error}"`) // eslint-disable-line no-console
      if (!this.isUnmounted) {
        this.setState({ status: 'load-error' })
      }
    })
  }

  componentDidUpdate(prevProps: StructureViewerProps) {
    const { viewer } = this
    const {
      residueColors,
      highlightedResidueRanges,
      overlays,
      overlayOpacity,
      overlaySize,
      resetViewCount,
    } = this.props
    if (!viewer) {
      return
    }
    if (
      residueColors !== prevProps.residueColors ||
      highlightedResidueRanges !== prevProps.highlightedResidueRanges
    ) {
      this.styleCartoon(viewer)
    }
    if (
      overlays !== prevProps.overlays ||
      overlayOpacity !== prevProps.overlayOpacity ||
      overlaySize !== prevProps.overlaySize
    ) {
      this.styleOverlays(viewer)
    }
    if (resetViewCount !== prevProps.resetViewCount) {
      frameConfidentResidues(viewer)
    }
    viewer.render()
  }

  componentWillUnmount() {
    this.isUnmounted = true
    window.removeEventListener('resize', this.onResize)
    if (this.viewer) {
      this.viewer.clear()
    }
  }

  onResize = () => {
    if (this.viewer) {
      this.viewer.resize()
    }
  }

  onHoverAtom = (atom: Atom, _viewer: GLViewer, event: MouseEvent) => {
    const { onHoverResidue } = this.props
    const bounds = this.container!.getBoundingClientRect()
    onHoverResidue({
      residueNumber: atom.resi,
      residueName: atom.resn,
      plddt: atom.b,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    })
  }

  onUnhoverAtom = () => {
    const { onHoverResidue } = this.props
    onHoverResidue(null)
  }

  async loadStructure() {
    const { structureUrl, expectedSequence, onLoadStructure } = this.props

    let viewer: GLViewer
    try {
      // Depth fog would fade the constraint colors of residues further from the camera
      viewer = createViewer(this.container, {
        backgroundColor: 'white',
        antialias: true,
        disableFog: true,
      })
    } catch (error) {
      this.setState({ status: 'webgl-unavailable' })
      return
    }

    // SPIKE: 3Dmol's BinaryCIF parser requires symmetry operators, which AlphaFold models lack
    const response = await fetch(structureUrl.replace(/\.bcif$/, '.cif'))
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }
    const structureData = await response.text()
    if (this.isUnmounted) {
      return
    }
    const cartoonModel = viewer.addModel(structureData, 'cif')

    const alphaCarbons = viewer.selectedAtoms({ model: cartoonModel, atom: 'CA' })
    const residues = alphaCarbons.map((atom): [number, string] => [atom.resi!, atom.resn!])
    if (!residueNamesMatchSequence(residues, expectedSequence)) {
      viewer.clear()
      this.setState({ status: 'sequence-mismatch' })
      return
    }

    // AlphaFold models store pLDDT as the B-factor
    const plddtByResidue: number[] = []
    alphaCarbons.forEach((atom) => {
      plddtByResidue[atom.resi!] = atom.b!
    })

    this.cartoonModel = cartoonModel
    this.overlayModel = viewer.addModel(structureData, 'cif')

    viewer.setHoverDuration(HOVER_DELAY_MS)
    viewer.setHoverable({}, true, this.onHoverAtom, this.onUnhoverAtom)
    this.styleCartoon(viewer)
    this.styleOverlays(viewer)
    frameConfidentResidues(viewer)
    viewer.render()
    this.viewer = viewer
    this.setState({ status: 'ready' })
    onLoadStructure(plddtByResidue)
  }

  styleCartoon(viewer: GLViewer) {
    const { residueColors, highlightedResidueRanges } = this.props
    // A cartoon's colorfunc takes precedence over any color added to it later
    const isHighlighted = (residueNumber: number) =>
      highlightedResidueRanges.some(
        ([start, stop]) => start <= residueNumber && residueNumber <= stop
      )
    viewer.setStyle(
      { model: this.cartoonModel! },
      {
        cartoon: {
          colorfunc: (atom: Atom) =>
            isHighlighted(atom.resi)
              ? STRUCTURE_HIGHLIGHT_COLOR
              : residueColors[atom.resi] || NO_REGION_COLOR,
        },
      }
    )
  }

  styleOverlays(viewer: GLViewer) {
    const { overlays, overlayOpacity, overlaySize } = this.props
    const model = this.overlayModel!
    viewer.setStyle({ model }, {})
    overlays.forEach((overlay) => {
      if (overlay.style === 'variant') {
        viewer.addStyle(
          { model, ...residueSelection(overlay.residueRanges), atom: 'CA' },
          {
            sphere: {
              color: overlay.color,
              radius: VARIANT_SPHERE_RADIUS * overlaySize,
              opacity: overlayOpacity,
            },
          }
        )
      } else {
        viewer.addStyle(
          { model, ...residueSelection(overlay.residueRanges) },
          {
            stick: {
              color: overlay.color,
              radius: FEATURE_STICK_RADIUS * overlaySize,
              opacity: overlayOpacity,
            },
          }
        )
      }
    })
  }

  render() {
    const { status } = this.state
    return (
      <>
        <ViewerContainer
          ref={(element) => {
            this.container = element
          }}
        />
        {status !== 'ready' && (
          <StatusOverlay>
            <StatusMessage>{STRUCTURE_VIEWER_STATUS_MESSAGES[status]}</StatusMessage>
          </StatusOverlay>
        )}
      </>
    )
  }
}

export default StructureViewer3Dmol
