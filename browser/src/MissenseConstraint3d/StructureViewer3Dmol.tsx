import { createViewer, GLViewer } from '3dmol'
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

const residueSelection = (residueRanges: ResidueRange[]) =>
  residueRanges.map(([start, stop]): `${number}-${number}` => `${start}-${stop}`)

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
    const { residueColors, highlightedResidueRanges, overlays, resetViewCount } = this.props
    if (!viewer) {
      return
    }
    if (
      residueColors !== prevProps.residueColors ||
      highlightedResidueRanges !== prevProps.highlightedResidueRanges ||
      overlays !== prevProps.overlays
    ) {
      this.applyStyles(viewer)
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
    viewer.addModel(structureData, 'cif')

    const alphaCarbons = viewer.selectedAtoms({ atom: 'CA' })
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

    viewer.setHoverDuration(HOVER_DELAY_MS)
    viewer.setHoverable({}, true, this.onHoverAtom, this.onUnhoverAtom)
    this.applyStyles(viewer)
    frameConfidentResidues(viewer)
    viewer.render()
    this.viewer = viewer
    this.setState({ status: 'ready' })
    onLoadStructure(plddtByResidue)
  }

  applyStyles(viewer: GLViewer) {
    const { residueColors, highlightedResidueRanges, overlays } = this.props
    // A cartoon's colorfunc takes precedence over any color added to it later
    const isHighlighted = (residueNumber: number) =>
      highlightedResidueRanges.some(
        ([start, stop]) => start <= residueNumber && residueNumber <= stop
      )
    viewer.setStyle(
      {},
      {
        cartoon: {
          colorfunc: (atom: Atom) =>
            isHighlighted(atom.resi)
              ? STRUCTURE_HIGHLIGHT_COLOR
              : residueColors[atom.resi] || NO_REGION_COLOR,
        },
      }
    )
    overlays.forEach((overlay) => {
      if (overlay.style === 'variant') {
        viewer.addStyle(
          { resi: residueSelection(overlay.residueRanges), atom: 'CA' },
          { sphere: { color: overlay.color, radius: VARIANT_SPHERE_RADIUS } }
        )
      } else {
        viewer.addStyle(
          { resi: residueSelection(overlay.residueRanges) },
          { stick: { color: overlay.color, radius: FEATURE_STICK_RADIUS } }
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
