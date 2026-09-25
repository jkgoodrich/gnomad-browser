import React, { ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react'

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

// Shares the variants that the gene page's variant table and ClinVar track list with other parts of
// the page, like the 3D missense constraint structure. When they change, only the components using
// them render again, not the whole page.
export const ListedVariantsProvider = ({ children }: { children: ReactNode }) => {
  const [variantIdsInTable, onChangeVariantsInTable] = useListedVariantIds()
  const [clinvarVariantIdsInTrack, onChangeClinvarVariantsInTrack] = useListedVariantIds()
  const listedVariants = useMemo(
    () => ({ variantIdsInTable, clinvarVariantIdsInTrack }),
    [variantIdsInTable, clinvarVariantIdsInTrack]
  )
  const callbacks = useMemo(
    () => ({ onChangeVariantsInTable, onChangeClinvarVariantsInTrack }),
    [onChangeVariantsInTable, onChangeClinvarVariantsInTrack]
  )
  return (
    <ListedVariantsCallbacksContext.Provider value={callbacks}>
      <ListedVariantsContext.Provider value={listedVariants}>
        {children}
      </ListedVariantsContext.Provider>
    </ListedVariantsCallbacksContext.Provider>
  )
}

export const useListedVariants = () => useContext(ListedVariantsContext)

export const useListedVariantsCallbacks = () => useContext(ListedVariantsCallbacksContext)
