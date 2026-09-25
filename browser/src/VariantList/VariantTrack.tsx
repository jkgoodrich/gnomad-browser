import { transparentize } from 'polished'
import React, { PureComponent } from 'react'

// @ts-expect-error TS(7016) FIXME: Could not find a declaration file for module '@gno... Remove this comment to see the full error message
import BaseVariantTrack from '@gnomad/track-variants'

import { getCategoryFromConsequence, VEP_CONSEQUENCE_CATEGORY_COLORS } from '../vepConsequences'

const consequenceCategoryColors = {
  lof: transparentize(0.3, VEP_CONSEQUENCE_CATEGORY_COLORS.lof),
  missense: transparentize(0.3, VEP_CONSEQUENCE_CATEGORY_COLORS.missense),
  synonymous: transparentize(0.3, VEP_CONSEQUENCE_CATEGORY_COLORS.synonymous),
  other: transparentize(0.3, VEP_CONSEQUENCE_CATEGORY_COLORS.other),
}

const variantColor = (variant: any) => {
  const category = getCategoryFromConsequence(variant.consequence) || 'other'
  // @ts-expect-error TS(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  return consequenceCategoryColors[category]
}

class VariantTrack extends PureComponent {
  render() {
    return <BaseVariantTrack variantColor={variantColor} {...this.props} />
  }
}

export default VariantTrack
