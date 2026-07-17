import { Node, mergeAttributes } from "@tiptap/core"

export const PlainTextControl = Node.create({
	name: "plainTextControl",
	group: "inline",
	inline: true,
	contenteditable: true,
	draggable: true,

	addAttributes() {
		return { placeholder: { default: "Enter text" } }
	},

	parseHTML() {
		return [{ tag: 'span[data-content-control="plain-text"]' }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-content-control": "plain-text",
				style: "border-bottom: 1px dotted #999; padding: 0 4px; min-width: 80px; display: inline-block;",
			}),
			0,
		]
	},
})

export const DropdownControl = Node.create({
	name: "dropdownControl",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,

	addAttributes() {
		return {
			options: {
				default: "",
				parseHTML: (el) => (el as HTMLElement).getAttribute("data-options") ?? "",
				renderHTML: (attrs) => ({ "data-options": attrs.options as string }),
			},
			placeholder: { default: "Select..." },
		}
	},

	parseHTML() {
		return [{ tag: 'span[data-content-control="dropdown"]' }]
	},

	renderHTML({ HTMLAttributes, node }) {
		const options = (node.attrs.options as string).split(",")
		const placeholder = node.attrs.placeholder as string
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-content-control": "dropdown",
				style: "border: 1px solid #999; padding: 2px 4px; display: inline-block; min-width: 80px; cursor: pointer;",
			}),
			placeholder,
		]
	},
})

export const CheckboxControl = Node.create({
	name: "checkboxControl",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,

	addAttributes() {
		return {
			checked: { default: false },
		}
	},

	parseHTML() {
		return [{ tag: 'span[data-content-control="checkbox"]' }]
	},

	renderHTML({ HTMLAttributes, node }) {
		const checked = node.attrs.checked as boolean
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-content-control": "checkbox",
				contenteditable: "false",
				style: "display: inline-block; width: 16px; height: 16px; border: 1px solid #999; vertical-align: middle; cursor: pointer;",
			}),
			checked ? "☑" : "☐",
		]
	},
})

export const DatePickerControl = Node.create({
	name: "datePickerControl",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,

	addAttributes() {
		return {
			value: { default: "" },
			format: { default: "YYYY-MM-DD" },
		}
	},

	parseHTML() {
		return [{ tag: 'span[data-content-control="date-picker"]' }]
	},

	renderHTML({ HTMLAttributes, node }) {
		const value = (node.attrs.value as string) || new Date().toISOString().slice(0, 10)
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-content-control": "date-picker",
				contenteditable: "false",
				style: "border-bottom: 1px dotted #999; padding: 0 4px; display: inline-block; min-width: 100px; cursor: pointer;",
			}),
			value,
		]
	},
})
