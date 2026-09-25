import React, { Component } from 'react'
import styled from 'styled-components'

import {
  Structure,
  StructureElement,
  StructureProperties,
  StructureSelection,
} from 'molstar/lib/mol-model/structure'
import { InteractivityManager } from 'molstar/lib/mol-plugin-state/manager/interactivity'
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects'
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms'
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state'
import { PluginConfig } from 'molstar/lib/mol-plugin/config'
import { PluginContext } from 'molstar/lib/mol-plugin/context'
import { DefaultPluginSpec } from 'molstar/lib/mol-plugin/spec'
import { CartoonRepresentationProvider } from 'molstar/lib/mol-repr/structure/representation/cartoon'
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder'
import { Script } from 'molstar/lib/mol-script/script'
import { StateObjectSelector } from 'molstar/lib/mol-state'
import { ColorTheme } from 'molstar/lib/mol-theme/color'
import { ThemeDataContext } from 'molstar/lib/mol-theme/theme'
import { Color } from 'molstar/lib/mol-util/color'
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition'

import StatusMessage from '../StatusMessage'
import {
  CONFIDENT_PLDDT,
  NO_REGION_COLOR,
  ResidueRange,
  STRUCTURE_HIGHLIGHT_COLOR,
  STRUCTURE_VIEWER_STATUS_MESSAGES,
  StructureOverlay,
  StructureViewerProps,
  StructureViewerStatus,
  residueNamesMatchSequence,
} from './missenseConstraint3d'

const RESIDUE_COLOR_THEME_NAME = 'gnomad-residue-colors'
// At an overlay size of 1. The stick size is Mol*'s default for ball-and-stick representations.
const VARIANT_SPHERE_SIZE = 1.5
const FEATURE_STICK_SIZE_FACTOR = 0.15
const NO_DATA_COLOR = Color.fromHexStyle(NO_REGION_COLOR)

// A dense array rather than a Map: Mol* compares theme params with a deep equality that ignores Maps
const residueColorThemeParams = { colors: PD.Value<Color[]>([], { isHidden: true }) }
type ResidueColorThemeParams = typeof residueColorThemeParams

const residueColorTheme = (
  _ctx: ThemeDataContext,
  props: PD.Values<ResidueColorThemeParams>
): ColorTheme<ResidueColorThemeParams> => ({
  factory: residueColorTheme,
  granularity: 'group',
  props,
  color: (location) =>
    StructureElement.Location.is(location)
      ? props.colors[StructureProperties.residue.auth_seq_id(location)] ?? NO_DATA_COLOR
      : NO_DATA_COLOR,
})

const ResidueColorThemeProvider: ColorTheme.Provider<
  ResidueColorThemeParams,
  typeof RESIDUE_COLOR_THEME_NAME
> = {
  name: RESIDUE_COLOR_THEME_NAME,
  label: 'gnomAD residue colors',
  category: ColorTheme.Category.Residue,
  factory: residueColorTheme,
  getParams: () => residueColorThemeParams,
  defaultValues: PD.getDefaultValues(residueColorThemeParams),
  isApplicable: () => true,
}

const residueExpression = (residueRanges: ResidueRange[], atomName?: string) =>
  MS.struct.generator.atomGroups({
    'residue-test': MS.core.logic.or(
      residueRanges.map(([start, stop]) =>
        MS.core.rel.inRange([MS.ammp('auth_seq_id'), start, stop])
      )
    ),
    ...(atomName ? { 'atom-test': MS.core.rel.eq([MS.ammp('label_atom_id'), atomName]) } : {}),
  })

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

type State = {
  status: StructureViewerStatus
}

class StructureViewerMolstar extends Component<StructureViewerProps, State> {
  container: HTMLDivElement | null = null

  plugin: PluginContext | null = null

  structure: StateObjectSelector<PluginStateObject.Molecule.Structure> | null = null

  cartoon: StateObjectSelector<PluginStateObject.Molecule.Structure.Representation3D> | null = null

  overlayComponents = new Map<string, StateObjectSelector>()

  // The overlay each component was made for, to remake it if the overlay's residues change
  overlaysWithComponents = new Map<string, StructureOverlay>()

  overlayRepresentations = new Map<
    string,
    StateObjectSelector<PluginStateObject.Molecule.Structure.Representation3D>
  >()

  hoverSubscription: { unsubscribe: () => void } | null = null

  // Mol* state updates are asynchronous, so apply prop changes one at a time
  updates: Promise<void> = Promise.resolve()

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
    const { status } = this.state
    if (status !== 'ready') {
      return
    }
    const {
      residueColors,
      highlightedResidueRanges,
      overlays,
      overlayOpacity,
      overlaySize,
      resetViewCount,
    } = this.props
    this.enqueueUpdate(async () => {
      if (residueColors !== prevProps.residueColors) {
        await this.recolor()
      }
      if (overlays !== prevProps.overlays) {
        await this.showOverlays()
      }
      if (overlayOpacity !== prevProps.overlayOpacity || overlaySize !== prevProps.overlaySize) {
        await this.styleOverlays()
      }
      if (highlightedResidueRanges !== prevProps.highlightedResidueRanges) {
        this.highlightResidues()
      }
      if (resetViewCount !== prevProps.resetViewCount) {
        this.frameConfidentResidues()
      }
    })
  }

  componentWillUnmount() {
    this.isUnmounted = true
    window.removeEventListener('resize', this.onResize)
    if (this.hoverSubscription) {
      this.hoverSubscription.unsubscribe()
    }
    if (this.plugin) {
      this.plugin.dispose()
    }
  }

  onResize = () => {
    if (this.plugin) {
      this.plugin.handleResize()
    }
  }

  onHover = ({ current, page }: InteractivityManager.HoverEvent) => {
    const { onHoverResidue } = this.props
    const location =
      page && StructureElement.Loci.is(current.loci)
        ? StructureElement.Loci.getFirstLocation(current.loci)
        : undefined
    if (!page || !location) {
      onHoverResidue(null)
      return
    }
    onHoverResidue({
      residueNumber: StructureProperties.residue.auth_seq_id(location),
      residueName: StructureProperties.atom.label_comp_id(location),
      plddt: StructureProperties.atom.B_iso_or_equiv(location),
      x: page[0],
      y: page[1],
    })
  }

  enqueueUpdate(update: () => Promise<void>) {
    this.updates = this.updates
      .then(() => (this.isUnmounted ? undefined : update()))
      .catch((error) => console.error(`failed to update structure: "${error}"`)) // eslint-disable-line no-console
  }

  async loadStructure() {
    const { structureUrl, expectedSequence, residueColors, onLoadStructure } = this.props

    const plugin = new PluginContext({
      ...DefaultPluginSpec(),
      config: [[PluginConfig.VolumeStreaming.Enabled, false]],
    })
    this.plugin = plugin
    await plugin.init()
    if (this.isUnmounted) {
      return
    }
    if (!plugin.mount(this.container!)) {
      this.setState({ status: 'webgl-unavailable' })
      return
    }
    plugin.canvas3d!.setProps({
      renderer: {
        backgroundColor: Color(0xffffff),
        highlightColor: Color.fromHexStyle(STRUCTURE_HIGHLIGHT_COLOR),
      },
      camera: { helper: { axes: { name: 'off', params: {} } } },
    })
    plugin.representation.structure.themes.colorThemeRegistry.add(ResidueColorThemeProvider)

    const data = await plugin.builders.data.download({ url: structureUrl, isBinary: true })
    const trajectory = await plugin.builders.structure.parseTrajectory(data, 'mmcif')
    const model = await plugin.builders.structure.createModel(trajectory)
    this.structure = await plugin.builders.structure.createStructure(model)
    if (this.isUnmounted) {
      return
    }

    const residues: [number, string][] = []
    // AlphaFold models store pLDDT as the B-factor, the same for every atom in a residue
    const plddtByResidue: number[] = []
    Structure.eachAtomicHierarchyElement(this.structure.data!, {
      residue: (location) => {
        const residueNumber = StructureProperties.residue.auth_seq_id(location)
        residues.push([residueNumber, StructureProperties.atom.label_comp_id(location)])
        plddtByResidue[residueNumber] = StructureProperties.atom.B_iso_or_equiv(location)
      },
    })
    if (!residueNamesMatchSequence(residues, expectedSequence)) {
      this.setState({ status: 'sequence-mismatch' })
      return
    }

    const polymer = await plugin.builders.structure.tryCreateComponentStatic(
      this.structure,
      'polymer'
    )
    this.cartoon = await plugin.builders.structure.representation.addRepresentation(polymer!, {
      type: CartoonRepresentationProvider,
      color: ResidueColorThemeProvider,
      colorParams: { colors: residueColors.map((color) => Color.fromHexStyle(color)) },
    })
    this.hoverSubscription = plugin.behaviors.interaction.hover.subscribe(this.onHover)
    await this.showOverlays()
    this.highlightResidues()
    this.frameConfidentResidues()
    if (!this.isUnmounted) {
      this.setState({ status: 'ready' })
      onLoadStructure(plddtByResidue)
    }
  }

  frameConfidentResidues() {
    const camera = this.plugin!.managers.camera
    const selection = Script.getStructureSelection(
      MS.struct.generator.atomGroups({
        'atom-test': MS.core.rel.gre([MS.ammp('B_iso_or_equiv'), CONFIDENT_PLDDT]),
      }),
      this.structure!.data!
    )
    if (StructureSelection.isEmpty(selection)) {
      camera.reset()
      return
    }
    camera.focusLoci(StructureSelection.toLociWithSourceUnits(selection), { durationMs: 0 })
  }

  async recolor() {
    const { residueColors } = this.props
    await this.plugin!.build()
      .to(this.cartoon!)
      .update(StateTransforms.Representation.StructureRepresentation3D, (params) => ({
        ...params,
        colorTheme: {
          name: RESIDUE_COLOR_THEME_NAME,
          params: { colors: residueColors.map((color) => Color.fromHexStyle(color)) },
        },
      }))
      .commit()
  }

  async createOverlay(overlay: StructureOverlay) {
    const { overlayOpacity, overlaySize } = this.props
    const plugin = this.plugin!
    const component = await plugin.builders.structure.tryCreateComponentFromExpression(
      this.structure!,
      residueExpression(overlay.residueRanges, overlay.style === 'variant' ? 'CA' : undefined),
      `overlay-${overlay.id}`,
      { label: overlay.label }
    )
    if (!component) {
      return
    }
    const color = Color.fromHexStyle(overlay.color)
    const representation = await plugin.builders.structure.representation.addRepresentation(
      component,
      overlay.style === 'variant'
        ? {
            type: 'spacefill',
            typeParams: { alpha: overlayOpacity },
            color: 'uniform',
            colorParams: { value: color },
            size: 'uniform',
            sizeParams: { value: VARIANT_SPHERE_SIZE * overlaySize },
          }
        : {
            type: 'ball-and-stick',
            typeParams: {
              alpha: overlayOpacity,
              sizeFactor: FEATURE_STICK_SIZE_FACTOR * overlaySize,
            },
            color: 'uniform',
            colorParams: { value: color },
          }
    )
    this.overlayComponents.set(overlay.id, component)
    this.overlaysWithComponents.set(overlay.id, overlay)
    this.overlayRepresentations.set(overlay.id, representation)
  }

  async styleOverlays() {
    const { overlayOpacity, overlaySize } = this.props
    const update = this.plugin!.build()
    this.overlayRepresentations.forEach((representation) => {
      update
        .to(representation)
        .update(StateTransforms.Representation.StructureRepresentation3D, (params) => ({
          ...params,
          // Variants are drawn as spheres, and features as sticks
          ...(params.type.name === 'spacefill'
            ? {
                type: { ...params.type, params: { ...params.type.params, alpha: overlayOpacity } },
                sizeTheme: {
                  ...params.sizeTheme,
                  params: { value: VARIANT_SPHERE_SIZE * overlaySize },
                },
              }
            : {
                type: {
                  ...params.type,
                  params: {
                    ...params.type.params,
                    alpha: overlayOpacity,
                    sizeFactor: FEATURE_STICK_SIZE_FACTOR * overlaySize,
                  },
                },
              }),
        }))
    })
    await update.commit()
  }

  async showOverlays() {
    const { overlays } = this.props
    // Like the variant table's current selection, when its filters change
    const changedOverlays = overlays.filter(
      (overlay) =>
        this.overlayComponents.has(overlay.id) &&
        this.overlaysWithComponents.get(overlay.id) !== overlay
    )
    if (changedOverlays.length > 0) {
      const update = this.plugin!.build()
      changedOverlays.forEach((overlay) => {
        update.delete(this.overlayComponents.get(overlay.id)!.ref)
        this.overlayComponents.delete(overlay.id)
        this.overlayRepresentations.delete(overlay.id)
        this.overlaysWithComponents.delete(overlay.id)
      })
      await update.commit()
    }
    const newOverlays = overlays.filter((overlay) => !this.overlayComponents.has(overlay.id))
    await newOverlays.reduce(
      (previous, overlay) => previous.then(() => this.createOverlay(overlay)),
      Promise.resolve()
    )
    const visibleOverlayIds = new Set(overlays.map((overlay) => overlay.id))
    this.overlayComponents.forEach((component, overlayId) => {
      setSubtreeVisibility(
        this.plugin!.state.data,
        component.ref,
        !visibleOverlayIds.has(overlayId)
      )
    })
  }

  highlightResidues() {
    const { highlightedResidueRanges } = this.props
    const highlights = this.plugin!.managers.interactivity.lociHighlights
    if (highlightedResidueRanges.length === 0) {
      highlights.clearHighlights()
      return
    }
    const selection = Script.getStructureSelection(
      residueExpression(highlightedResidueRanges),
      this.structure!.data!
    )
    highlights.highlightOnly({ loci: StructureSelection.toLociWithSourceUnits(selection) })
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

export default StructureViewerMolstar
