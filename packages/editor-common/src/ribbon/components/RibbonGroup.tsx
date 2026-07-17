import { useTranslation } from "react-i18next"
import type { RibbonCommandDispatch, RibbonContext, RibbonGroupSpec } from "../types"
import { ControlRenderer } from "./ControlRenderer"

interface RibbonGroupProps {
  group: RibbonGroupSpec
  context: RibbonContext
  dispatch: RibbonCommandDispatch
}

export function RibbonGroup({ group, context, dispatch }: RibbonGroupProps) {
  const { t } = useTranslation()

  return (
    <div className="de-ribbon-group">
      <div className="de-ribbon-elset">
        {group.controls.map((control) => (
          <ControlRenderer
            key={control.id}
            control={control}
            context={context}
            dispatch={dispatch}
          />
        ))}
      </div>
      <span className="de-ribbon-label">{t(group.label)}</span>
    </div>
  )
}
