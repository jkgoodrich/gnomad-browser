import React, { ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react'

import {
  ClinvarTrackFilter,
  DEFAULT_CLINVAR_TRACK_FILTER,
} from '../ClinvarVariantsTrack/ClinvarVariantTrack'
import { PageFilter, StructureSelection } from '../MissenseConstraint3d/missenseConstraint3d'
import { DEFAULT_VARIANT_FILTER, VariantFilterState } from '../VariantList/filterVariants'

type ListedVariantIds = Set<string> | null

type OnChangeListedVariants = (variants: { variant_id: string }[]) => void

// The IDs of the variants that a section of the gene page, like the variant table, lists
const useListedVariantIds = (): [ListedVariantIds, OnChangeListedVariants] => {
  const [variantIds, setVariantIds] = useState<ListedVariantIds>(null)
  const onChangeVariants = useCallback((variants: { variant_id: string }[]) => {
    setVariantIds((previousVariantIds) => {
      const nextVariantIds = new Set(variants.map((variant) => variant.variant_id))
      // Sections rebuild their lists whenever the page renders, so keep the same set while its
      // variants are unchanged
      return previousVariantIds &&
        previousVariantIds.size === nextVariantIds.size &&
        Array.from(nextVariantIds).every((variantId) => previousVariantIds.has(variantId))
        ? previousVariantIds
        : nextVariantIds
    })
  }, [])
  return [variantIds, onChangeVariants]
}

type ListedVariants = {
  variantIdsInTable: ListedVariantIds
  clinvarVariantIdsInTrack: ListedVariantIds
}

type ListedVariantsCallbacks = {
  onChangeVariantsInTable?: OnChangeListedVariants
  onChangeClinvarVariantsInTrack?: OnChangeListedVariants
}

const ListedVariantsContext = createContext<ListedVariants>({
  variantIdsInTable: null,
  clinvarVariantIdsInTrack: null,
})

const ListedVariantsCallbacksContext = createContext<ListedVariantsCallbacks>({})

const StructureSelectionContext = createContext<StructureSelection | null>(null)

const SetStructureSelectionContext = createContext<(selection: StructureSelection | null) => void>(
  () => {}
)

const ClinvarTrackFilterContext = createContext<PageFilter<ClinvarTrackFilter> | undefined>(
  undefined
)

const VariantTableFilterContext = createContext<PageFilter<VariantFilterState> | undefined>(
  undefined
)

const usePageFilter = <F,>(defaultFilter: F): PageFilter<F> => {
  const [filter, onChangeFilter] = useState(defaultFilter)
  return useMemo(() => ({ filter, onChangeFilter }), [filter])
}

// Shares selections between sections of the gene page: the variants that the variant table and
// ClinVar track list, which the 3D missense constraint structure can show, and the residues selected
// on the structure, which those sections then show only the variants of. It also holds the filters
// of the variant table and ClinVar track, which the structure's legend can change too. When a
// selection changes, only the components using it render again, not the whole page.
export const GenePageSelectionsProvider = ({ children }: { children: ReactNode }) => {
  const [variantIdsInTable, onChangeVariantsInTable] = useListedVariantIds()
  const [clinvarVariantIdsInTrack, onChangeClinvarVariantsInTrack] = useListedVariantIds()
  const [structureSelection, setStructureSelection] = useState<StructureSelection | null>(null)
  const clinvarTrackFilter = usePageFilter(DEFAULT_CLINVAR_TRACK_FILTER)
  const variantTableFilter = usePageFilter(DEFAULT_VARIANT_FILTER)
  const listedVariants = useMemo(
    () => ({ variantIdsInTable, clinvarVariantIdsInTrack }),
    [variantIdsInTable, clinvarVariantIdsInTrack]
  )
  const callbacks = useMemo(
    () => ({ onChangeVariantsInTable, onChangeClinvarVariantsInTrack }),
    [onChangeVariantsInTable, onChangeClinvarVariantsInTrack]
  )
  return (
    <SetStructureSelectionContext.Provider value={setStructureSelection}>
      <StructureSelectionContext.Provider value={structureSelection}>
        <ListedVariantsCallbacksContext.Provider value={callbacks}>
          <ListedVariantsContext.Provider value={listedVariants}>
            <ClinvarTrackFilterContext.Provider value={clinvarTrackFilter}>
              <VariantTableFilterContext.Provider value={variantTableFilter}>
                {children}
              </VariantTableFilterContext.Provider>
            </ClinvarTrackFilterContext.Provider>
          </ListedVariantsContext.Provider>
        </ListedVariantsCallbacksContext.Provider>
      </StructureSelectionContext.Provider>
    </SetStructureSelectionContext.Provider>
  )
}

export const useListedVariants = () => useContext(ListedVariantsContext)

export const useListedVariantsCallbacks = () => useContext(ListedVariantsCallbacksContext)

export const useStructureSelection = () => useContext(StructureSelectionContext)

export const useSetStructureSelection = () => useContext(SetStructureSelectionContext)

export const useClinvarTrackFilter = () => useContext(ClinvarTrackFilterContext)

export const useVariantTableFilter = () => useContext(VariantTableFilterContext)
