// Piary's A2UI catalog as a catalog document: `piaryCatalog.toJson()` from
// src/components/views/a2ui-catalog.ts, which the `view` tool cannot import.
// Generated — tests/contract/a2ui-copies.test.ts names the command and holds
// it to the source.
export const A2UI_CATALOG: Record<string, unknown> = {
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"protocolVersion": "1.0",
	"catalogId": "https://piary.dev/a2ui/catalog/v1.json",
	"components": {
		"Text": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Text"
				},
				"text": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "The text content to display. While simple Markdown formatting is supported (i.e. without HTML, images, or links), utilizing dedicated UI components is generally preferred for a richer and more structured presentation."
				},
				"variant": {
					"type": "string",
					"enum": [
						"caption",
						"body"
					],
					"description": "A hint for the base text style.",
					"default": "body"
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component",
				"text"
			]
		},
		"Image": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Image"
				},
				"url": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "The URL of the image to display."
				},
				"description": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "Accessibility text for the image."
				},
				"fit": {
					"type": "string",
					"enum": [
						"contain",
						"cover",
						"fill",
						"none",
						"scaleDown"
					],
					"description": "Specifies how the image should be resized to fit its container. This corresponds to the CSS 'object-fit' property.",
					"default": "fill"
				},
				"variant": {
					"type": "string",
					"enum": [
						"icon",
						"avatar",
						"smallFeature",
						"mediumFeature",
						"largeFeature",
						"header"
					],
					"description": "A hint for the image size and style.",
					"default": "mediumFeature"
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component",
				"url"
			]
		},
		"Icon": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Icon"
				},
				"name": {
					"oneOf": [
						{
							"type": "string",
							"enum": [
								"accountCircle",
								"add",
								"arrowBack",
								"arrowForward",
								"attachFile",
								"calendarToday",
								"call",
								"camera",
								"check",
								"close",
								"delete",
								"download",
								"edit",
								"event",
								"error",
								"fastForward",
								"favorite",
								"favoriteOff",
								"folder",
								"help",
								"home",
								"info",
								"locationOn",
								"lock",
								"lockOpen",
								"mail",
								"menu",
								"moreVert",
								"moreHoriz",
								"notificationsOff",
								"notifications",
								"pause",
								"payment",
								"person",
								"phone",
								"photo",
								"play",
								"print",
								"refresh",
								"rewind",
								"search",
								"send",
								"settings",
								"share",
								"shoppingCart",
								"skipNext",
								"skipPrevious",
								"star",
								"starHalf",
								"starOff",
								"stop",
								"upload",
								"visibility",
								"visibilityOff",
								"volumeDown",
								"volumeMute",
								"volumeOff",
								"volumeUp",
								"warning"
							]
						},
						{
							"type": "object",
							"properties": {
								"svgPath": {
									"$ref": "common_types.json#/$defs/DynamicString"
								}
							},
							"required": [
								"svgPath"
							],
							"additionalProperties": false
						},
						{
							"$ref": "common_types.json#/$defs/DataBinding"
						}
					],
					"description": "The name of the icon to display."
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component",
				"name"
			]
		},
		"Video": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Video"
				},
				"url": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "The URL of the video to display."
				},
				"posterUrl": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "The URL of the poster image to display before the video plays."
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component",
				"url"
			]
		},
		"AudioPlayer": {
			"type": "object",
			"properties": {
				"component": {
					"const": "AudioPlayer"
				},
				"url": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "The URL of the audio to be played."
				},
				"description": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "A description of the audio, such as a title or summary."
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component",
				"url"
			]
		},
		"Row": {
			"type": "object",
			"description": "A layout component that arranges its children horizontally. To create a grid layout, nest Columns within this Row.",
			"properties": {
				"component": {
					"const": "Row"
				},
				"children": {
					"$ref": "common_types.json#/$defs/ChildList",
					"description": "Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID."
				},
				"justify": {
					"type": "string",
					"enum": [
						"center",
						"end",
						"spaceAround",
						"spaceBetween",
						"spaceEvenly",
						"start",
						"stretch"
					],
					"description": "Defines the arrangement of children along the main axis (horizontally). Use 'spaceBetween' to push items to the edges, or 'start'/'end'/'center' to pack them together.",
					"default": "start"
				},
				"align": {
					"type": "string",
					"enum": [
						"start",
						"center",
						"end",
						"stretch"
					],
					"description": "Defines the alignment of children along the cross axis (vertically). This is similar to the CSS 'align-items' property, but uses camelCase values (e.g., 'start').",
					"default": "stretch"
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component",
				"children"
			]
		},
		"Column": {
			"type": "object",
			"description": "A layout component that arranges its children vertically. To create a grid layout, nest Rows within this Column.",
			"properties": {
				"component": {
					"const": "Column"
				},
				"children": {
					"$ref": "common_types.json#/$defs/ChildList",
					"description": "Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID."
				},
				"justify": {
					"type": "string",
					"enum": [
						"start",
						"center",
						"end",
						"spaceBetween",
						"spaceAround",
						"spaceEvenly",
						"stretch"
					],
					"description": "Defines the arrangement of children along the main axis (vertically). Use 'spaceBetween' to push items to the edges (e.g. header at top, footer at bottom), or 'start'/'end'/'center' to pack them together.",
					"default": "start"
				},
				"align": {
					"type": "string",
					"enum": [
						"center",
						"end",
						"start",
						"stretch"
					],
					"description": "Defines the alignment of children along the cross axis (horizontally). This is similar to the CSS 'align-items' property.",
					"default": "stretch"
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component",
				"children"
			]
		},
		"List": {
			"type": "object",
			"properties": {
				"component": {
					"const": "List"
				},
				"children": {
					"$ref": "common_types.json#/$defs/ChildList",
					"description": "Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list."
				},
				"direction": {
					"type": "string",
					"enum": [
						"vertical",
						"horizontal"
					],
					"description": "The direction in which the list items are laid out.",
					"default": "vertical"
				},
				"align": {
					"type": "string",
					"enum": [
						"start",
						"center",
						"end",
						"stretch"
					],
					"description": "Defines the alignment of children along the cross axis.",
					"default": "stretch"
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component",
				"children"
			]
		},
		"Card": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Card"
				},
				"child": {
					"$ref": "common_types.json#/$defs/Child",
					"description": "The ID of the single child component to be rendered inside the card. To display multiple elements, you MUST wrap them in a layout component (like Column or Row) and pass that container's ID here. Do NOT pass multiple IDs or a non-existent ID."
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component",
				"child"
			]
		},
		"Tabs": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Tabs"
				},
				"tabs": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"title": {
								"$ref": "common_types.json#/$defs/DynamicString",
								"description": "The tab title."
							},
							"child": {
								"$ref": "common_types.json#/$defs/Child",
								"description": "The ID of the child component."
							}
						},
						"required": [
							"title",
							"child"
						],
						"additionalProperties": false
					},
					"minItems": 1,
					"description": "An array of objects, where each object defines a tab with a title and a child component."
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component",
				"tabs"
			]
		},
		"Modal": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Modal"
				},
				"trigger": {
					"$ref": "common_types.json#/$defs/Child",
					"description": "The ID of the component that opens the modal when interacted with (e.g., a button)."
				},
				"content": {
					"$ref": "common_types.json#/$defs/Child",
					"description": "The ID of the component to be displayed inside the modal."
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component",
				"trigger",
				"content"
			]
		},
		"Divider": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Divider"
				},
				"axis": {
					"type": "string",
					"enum": [
						"horizontal",
						"vertical"
					],
					"description": "The orientation of the divider.",
					"default": "horizontal"
				},
				"weight": {
					"$ref": "#/$defs/Weight"
				}
			},
			"required": [
				"component"
			]
		},
		"Button": {
			"type": "object",
			"allOf": [
				{
					"$ref": "common_types.json#/$defs/Checkable"
				},
				{
					"type": "object",
					"properties": {
						"component": {
							"const": "Button"
						},
						"child": {
							"$ref": "common_types.json#/$defs/Child",
							"description": "The ID of the child component. Use a 'Text' component for a labeled button. Only use an 'Icon' if the requirements explicitly ask for an icon-only button."
						},
						"variant": {
							"type": "string",
							"enum": [
								"default",
								"primary",
								"borderless"
							],
							"description": "A hint for the button style. If omitted, a default button style is used. 'primary' indicates this is the main call-to-action button. 'borderless' means the button has no visual border or background, making its child content appear like a clickable link.",
							"default": "default"
						},
						"action": {
							"$ref": "common_types.json#/$defs/Action"
						},
						"weight": {
							"$ref": "#/$defs/Weight"
						}
					},
					"required": [
						"component",
						"child",
						"action"
					]
				}
			]
		},
		"TextField": {
			"type": "object",
			"allOf": [
				{
					"$ref": "common_types.json#/$defs/Checkable"
				},
				{
					"type": "object",
					"properties": {
						"component": {
							"const": "TextField"
						},
						"label": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The text label for the input field."
						},
						"value": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The value of the text field."
						},
						"placeholder": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The placeholder text for the input field."
						},
						"variant": {
							"type": "string",
							"enum": [
								"longText",
								"number",
								"shortText",
								"obscured"
							],
							"description": "The type of input field to display.",
							"default": "shortText"
						},
						"weight": {
							"$ref": "#/$defs/Weight"
						}
					},
					"required": [
						"component",
						"label"
					]
				}
			]
		},
		"CheckBox": {
			"type": "object",
			"allOf": [
				{
					"$ref": "common_types.json#/$defs/Checkable"
				},
				{
					"type": "object",
					"properties": {
						"component": {
							"const": "CheckBox"
						},
						"label": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The text to display next to the checkbox."
						},
						"value": {
							"$ref": "common_types.json#/$defs/DynamicBoolean",
							"description": "The current state of the checkbox (true for checked, false for unchecked)."
						},
						"weight": {
							"$ref": "#/$defs/Weight"
						}
					},
					"required": [
						"component",
						"label",
						"value"
					]
				}
			]
		},
		"ChoicePicker": {
			"type": "object",
			"description": "A component that allows selecting one or more options from a list.",
			"allOf": [
				{
					"$ref": "common_types.json#/$defs/Checkable"
				},
				{
					"type": "object",
					"properties": {
						"component": {
							"const": "ChoicePicker"
						},
						"label": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The label for the group of options."
						},
						"variant": {
							"type": "string",
							"enum": [
								"multipleSelection",
								"mutuallyExclusive"
							],
							"description": "A hint for how the choice picker should be displayed and behave.",
							"default": "mutuallyExclusive"
						},
						"options": {
							"type": "array",
							"items": {
								"type": "object",
								"properties": {
									"label": {
										"$ref": "common_types.json#/$defs/DynamicString",
										"description": "The text to display for this option."
									},
									"value": {
										"type": "string",
										"description": "The stable value associated with this option."
									}
								},
								"required": [
									"label",
									"value"
								],
								"additionalProperties": false
							},
							"description": "The list of available options to choose from."
						},
						"value": {
							"$ref": "common_types.json#/$defs/DynamicStringList",
							"description": "The list of currently selected values. This should be bound to a string array in the data model."
						},
						"displayStyle": {
							"type": "string",
							"enum": [
								"checkbox",
								"chips"
							],
							"description": "The display style of the component.",
							"default": "checkbox"
						},
						"filterable": {
							"type": "boolean",
							"description": "If true, displays a search input to filter the options.",
							"default": false
						},
						"weight": {
							"$ref": "#/$defs/Weight"
						}
					},
					"required": [
						"component",
						"options",
						"value"
					]
				}
			]
		},
		"Slider": {
			"type": "object",
			"allOf": [
				{
					"$ref": "common_types.json#/$defs/Checkable"
				},
				{
					"type": "object",
					"properties": {
						"component": {
							"const": "Slider"
						},
						"label": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The label for the slider."
						},
						"min": {
							"type": "number",
							"description": "The minimum value of the slider.",
							"default": 0
						},
						"max": {
							"type": "number",
							"description": "The maximum value of the slider."
						},
						"value": {
							"$ref": "common_types.json#/$defs/DynamicNumber",
							"description": "The current value of the slider."
						},
						"steps": {
							"type": "integer",
							"minimum": 1,
							"description": "The number of discrete divisions in the slider range. If specified, the slider will snap to discrete values."
						},
						"weight": {
							"$ref": "#/$defs/Weight"
						}
					},
					"required": [
						"component",
						"value",
						"max"
					]
				}
			]
		},
		"DateTimeInput": {
			"type": "object",
			"allOf": [
				{
					"$ref": "common_types.json#/$defs/Checkable"
				},
				{
					"type": "object",
					"properties": {
						"component": {
							"const": "DateTimeInput"
						},
						"value": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The selected date and/or time value in ISO 8601 format. If not yet set, initialize with an empty string."
						},
						"enableDate": {
							"type": "boolean",
							"description": "If true, allows the user to select a date.",
							"default": false
						},
						"enableTime": {
							"type": "boolean",
							"description": "If true, allows the user to select a time.",
							"default": false
						},
						"min": {
							"allOf": [
								{
									"$ref": "common_types.json#/$defs/DynamicString"
								},
								{
									"if": {
										"type": "string"
									},
									"then": {
										"oneOf": [
											{
												"format": "date"
											},
											{
												"format": "time"
											},
											{
												"format": "date-time"
											}
										]
									}
								}
							],
							"description": "The minimum allowed date/time in ISO 8601 format."
						},
						"max": {
							"allOf": [
								{
									"$ref": "common_types.json#/$defs/DynamicString"
								},
								{
									"if": {
										"type": "string"
									},
									"then": {
										"oneOf": [
											{
												"format": "date"
											},
											{
												"format": "time"
											},
											{
												"format": "date-time"
											}
										]
									}
								}
							],
							"description": "The maximum allowed date/time in ISO 8601 format."
						},
						"label": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The text label for the input field."
						},
						"weight": {
							"$ref": "#/$defs/Weight"
						}
					},
					"required": [
						"component",
						"value"
					]
				}
			]
		},
		"Stat": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Stat"
				},
				"label": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "What the figure is, e.g. 'Tickets opened'."
				},
				"value": {
					"anyOf": [
						{
							"type": "number"
						},
						{
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The figure: a number (formatted here) or a string shown as written."
						}
					]
				},
				"unit": {
					"type": "string",
					"description": "Its unit: a currency ($, €, USD) is written before the number, anything else (%, h, ms) after."
				},
				"delta": {
					"anyOf": [
						{
							"type": "number"
						},
						{
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The change since last time: a number is signed and arrowed here; a string ('+3 pts') is shown as written."
						}
					]
				},
				"good": {
					"type": "string",
					"enum": [
						"up",
						"down"
					],
					"description": "Which direction of the delta is good news, which colours it; omit when neither is."
				},
				"note": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "A short line under the figure, e.g. 'vs 380 last week'."
				},
				"weight": {
					"type": "number",
					"description": "Flex weight inside a Row or Column."
				}
			},
			"required": [
				"component",
				"label",
				"value"
			],
			"unevaluatedProperties": false
		},
		"Table": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Table"
				},
				"columns": {
					"type": "array",
					"items": {
						"anyOf": [
							{
								"type": "string"
							},
							{
								"type": "object",
								"properties": {
									"key": {
										"type": "string",
										"description": "The row key (or, for array rows, the column's header)."
									},
									"label": {
										"type": "string",
										"description": "The header, when not the key."
									},
									"align": {
										"type": "string",
										"enum": [
											"start",
											"end"
										],
										"description": "Overrides the alignment: a column of numbers is set at the end."
									},
									"unit": {
										"type": "string",
										"description": "A unit for every number in the column, as Stat's."
									}
								},
								"required": [
									"key"
								],
								"additionalProperties": false
							}
						]
					},
					"description": "The columns in order: a row key, or { key, label?, align?, unit? }. Default: the first row's keys."
				},
				"rows": {
					"$ref": "common_types.json#/$defs/DynamicValue",
					"description": "The rows: objects by key or arrays by column; a literal list, a binding, or a `series` call."
				},
				"caption": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "A line under the table: its source or a note."
				},
				"weight": {
					"type": "number",
					"description": "Flex weight inside a Row or Column."
				}
			},
			"required": [
				"component",
				"rows"
			],
			"unevaluatedProperties": false
		},
		"Compare": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Compare"
				},
				"options": {
					"$ref": "common_types.json#/$defs/DynamicValue",
					"description": "The options, one object each, e.g. { name, price, sso }."
				},
				"name": {
					"type": "string",
					"description": "The key naming an option. Default 'name'."
				},
				"criteria": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"key": {
								"type": "string",
								"description": "The option key this criterion reads."
							},
							"label": {
								"type": "string",
								"description": "The row's name, when not the key."
							},
							"best": {
								"type": "string",
								"enum": [
									"min",
									"max"
								],
								"description": "Marks the lowest or highest value of the options that pass every must."
							},
							"must": {
								"type": "object",
								"properties": {
									"min": {
										"type": "number"
									},
									"max": {
										"type": "number"
									},
									"oneOf": {
										"type": "array",
										"items": {
											"type": [
												"string",
												"number",
												"boolean"
											]
										}
									}
								},
								"additionalProperties": false,
								"description": "A requirement: a value outside it is struck, and its option is out."
							},
							"unit": {
								"type": "string",
								"description": "A unit for the row's numbers, as Stat's."
							}
						},
						"required": [
							"key"
						],
						"additionalProperties": false
					},
					"description": "The rows: what the options are compared on, in order."
				},
				"pick": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "The name of the option recommended, which is marked."
				},
				"weight": {
					"type": "number",
					"description": "Flex weight inside a Row or Column."
				}
			},
			"required": [
				"component",
				"options",
				"criteria"
			],
			"unevaluatedProperties": false
		},
		"Callout": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Callout"
				},
				"tone": {
					"type": "string",
					"enum": [
						"info",
						"success",
						"warning",
						"destructive"
					],
					"description": "What kind of note it is. Default info."
				},
				"title": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "A few words in bold before the text."
				},
				"text": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "The note: the takeaway, a caveat, what to do next."
				},
				"weight": {
					"type": "number",
					"description": "Flex weight inside a Row or Column."
				}
			},
			"required": [
				"component",
				"text"
			],
			"unevaluatedProperties": false
		},
		"Chart": {
			"type": "object",
			"properties": {
				"component": {
					"const": "Chart"
				},
				"data": {
					"$ref": "common_types.json#/$defs/DynamicValue",
					"description": "The rows, one object each: a literal list, a binding, or a `series` call."
				},
				"mark": {
					"type": "string",
					"enum": [
						"bar",
						"barH",
						"line",
						"area",
						"dot"
					],
					"description": "bar: vertical bars per category; barH: horizontal bars, categories down the side; line, area: over an ordered x; dot: a scatter."
				},
				"x": {
					"type": "string",
					"description": "The row key along the bottom: the category, or the ordered value (a month, a year)."
				},
				"y": {
					"anyOf": [
						{
							"type": "string"
						},
						{
							"type": "array",
							"items": {
								"type": "string"
							}
						}
					],
					"description": "The row key of the value drawn, or several keys drawn as one series each. For barH, x and y are read whichever way round holds the categories."
				},
				"series": {
					"type": "string",
					"description": "A row key splitting the rows into coloured series, with a legend."
				},
				"layout": {
					"type": "string",
					"enum": [
						"stack",
						"group"
					],
					"description": "Bars with a series: stacked (default) or side by side."
				},
				"yScale": {
					"type": "string",
					"enum": [
						"linear",
						"log"
					],
					"description": "log for values spanning orders of magnitude."
				},
				"scheme": {
					"type": "string",
					"enum": [
						"categorical",
						"sequential",
						"diverging"
					],
					"description": "How series are coloured. categorical (default): distinct hues. Ordered series (a rating, a scale, low to high) take sequential, light to dark, or diverging, from a negative end through a neutral middle to a positive end; series come in the order of the rows."
				},
				"labels": {
					"type": "object",
					"additionalProperties": {
						"type": "string"
					},
					"description": "Names in the legend for series values or value keys, by what the rows hold: { \"cash5\": \"5% growth\" }."
				},
				"unit": {
					"type": "string",
					"description": "The value's unit, on the axis ticks: a currency before the number, anything else after."
				},
				"xLabel": {
					"type": "string",
					"description": "The axis label along the bottom, when not the key."
				},
				"yLabel": {
					"type": "string",
					"description": "The value axis label, when not the key."
				},
				"title": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "A heading over the chart."
				},
				"caption": {
					"$ref": "common_types.json#/$defs/DynamicString",
					"description": "A line under the chart: its source or how to read it."
				},
				"height": {
					"type": "number",
					"description": "Height in pixels, when the default does not suit."
				},
				"weight": {
					"type": "number",
					"description": "Flex weight inside a Row or Column."
				}
			},
			"required": [
				"component",
				"data",
				"mark",
				"x",
				"y"
			],
			"unevaluatedProperties": false
		}
	},
	"functions": {
		"required": {
			"type": "object",
			"description": "Checks that the value is not null, undefined, or empty.",
			"returnType": "validationResult",
			"properties": {
				"@call": {
					"const": "required"
				},
				"args": {
					"type": "object",
					"properties": {
						"value": {
							"description": "The value to check."
						}
					},
					"required": [
						"value"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"regex": {
			"type": "object",
			"description": "Checks that the value matches a regular expression string.",
			"returnType": "validationResult",
			"properties": {
				"@call": {
					"const": "regex"
				},
				"args": {
					"type": "object",
					"properties": {
						"value": {
							"$ref": "common_types.json#/$defs/DynamicString"
						},
						"pattern": {
							"type": "string",
							"description": "The regex pattern to match against."
						}
					},
					"required": [
						"value",
						"pattern"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"length": {
			"type": "object",
			"description": "Checks string length constraints.",
			"returnType": "validationResult",
			"properties": {
				"@call": {
					"const": "length"
				},
				"args": {
					"type": "object",
					"properties": {
						"value": {
							"$ref": "common_types.json#/$defs/DynamicString"
						},
						"min": {
							"type": "integer",
							"minimum": 0,
							"description": "The minimum allowed length."
						},
						"max": {
							"type": "integer",
							"minimum": 0,
							"description": "The maximum allowed length."
						}
					},
					"required": [
						"value"
					],
					"unevaluatedProperties": false,
					"anyOf": [
						{
							"required": [
								"min"
							]
						},
						{
							"required": [
								"max"
							]
						}
					]
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"numeric": {
			"type": "object",
			"description": "Checks numeric range constraints.",
			"returnType": "validationResult",
			"properties": {
				"@call": {
					"const": "numeric"
				},
				"args": {
					"type": "object",
					"properties": {
						"value": {
							"$ref": "common_types.json#/$defs/DynamicNumber"
						},
						"min": {
							"type": "number",
							"description": "The minimum allowed value."
						},
						"max": {
							"type": "number",
							"description": "The maximum allowed value."
						}
					},
					"required": [
						"value"
					],
					"unevaluatedProperties": false,
					"anyOf": [
						{
							"required": [
								"min"
							]
						},
						{
							"required": [
								"max"
							]
						}
					]
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"email": {
			"type": "object",
			"description": "Checks that the value is a valid email address.",
			"returnType": "validationResult",
			"properties": {
				"@call": {
					"const": "email"
				},
				"args": {
					"type": "object",
					"properties": {
						"value": {
							"$ref": "common_types.json#/$defs/DynamicString"
						}
					},
					"required": [
						"value"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"formatString": {
			"type": "object",
			"description": "Performs string interpolation of data model values and other functions in the catalog functions list and returns the resulting string. The value string can contain interpolated expressions in the `${expression}` format. Supported expression types include: JSON Pointer paths to the data model (e.g., `${/absolute/path}` or `${relative/path}`), and renderer-side function calls (e.g., `${now()}`). Function arguments must be named (e.g., `${formatDate(value:${/currentDate}, format:'MM-dd')}`). To include a literal `${` sequence, escape it as `\\${`.",
			"returnType": "string",
			"properties": {
				"@call": {
					"const": "formatString"
				},
				"args": {
					"type": "object",
					"properties": {
						"value": {
							"$ref": "common_types.json#/$defs/DynamicString"
						}
					},
					"required": [
						"value"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"formatNumber": {
			"type": "object",
			"description": "Formats a number with the specified grouping and decimal precision.",
			"returnType": "string",
			"properties": {
				"@call": {
					"const": "formatNumber"
				},
				"args": {
					"type": "object",
					"properties": {
						"value": {
							"$ref": "common_types.json#/$defs/DynamicNumber",
							"description": "The number to format."
						},
						"decimals": {
							"$ref": "common_types.json#/$defs/DynamicNumber",
							"description": "Optional. The number of decimal places to show. Defaults to 0 or 2 depending on locale."
						},
						"grouping": {
							"$ref": "common_types.json#/$defs/DynamicBoolean",
							"description": "Optional. If true, uses locale-specific grouping separators (e.g. '1,000'). If false, returns raw digits (e.g. '1000'). Defaults to true."
						}
					},
					"required": [
						"value"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"formatCurrency": {
			"type": "object",
			"description": "Formats a number as a currency string.",
			"returnType": "string",
			"properties": {
				"@call": {
					"const": "formatCurrency"
				},
				"args": {
					"type": "object",
					"properties": {
						"value": {
							"$ref": "common_types.json#/$defs/DynamicNumber",
							"description": "The monetary amount."
						},
						"currency": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The ISO 4217 currency code (e.g., 'USD', 'EUR')."
						},
						"decimals": {
							"$ref": "common_types.json#/$defs/DynamicNumber",
							"description": "Optional. The number of decimal places to show. Defaults to 0 or 2 depending on locale."
						},
						"grouping": {
							"$ref": "common_types.json#/$defs/DynamicBoolean",
							"description": "Optional. If true, uses locale-specific grouping separators (e.g. '1,000'). If false, returns raw digits (e.g. '1000'). Defaults to true."
						}
					},
					"required": [
						"currency",
						"value"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"formatDate": {
			"type": "object",
			"description": "Formats a timestamp into a string using a pattern.",
			"returnType": "string",
			"properties": {
				"@call": {
					"const": "formatDate"
				},
				"args": {
					"type": "object",
					"properties": {
						"value": {
							"$ref": "common_types.json#/$defs/DynamicValue",
							"description": "The date to format."
						},
						"format": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "A Unicode TR35 date pattern string.\n\nToken Reference:\n- Year: 'yy' (26), 'yyyy' (2026)\n- Month: 'M' (1), 'MM' (01), 'MMM' (Jan), 'MMMM' (January)\n- Day: 'd' (1), 'dd' (01), 'E' (Tue), 'EEEE' (Tuesday)\n- Hour (12h): 'h' (1-12), 'hh' (01-12) - requires 'a' for AM/PM\n- Hour (24h): 'H' (0-23), 'HH' (00-23) - Military Time\n- Minute: 'mm' (00-59)\n- Second: 'ss' (00-59)\n- Period: 'a' (AM/PM)\n\nExamples:\n- 'MMM dd, yyyy' -> 'Jan 16, 2026'\n- 'HH:mm' -> '14:30' (Military)\n- 'h:mm a' -> '2:30 PM'\n- 'EEEE, d MMMM' -> 'Friday, 16 January'"
						}
					},
					"required": [
						"format",
						"value"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"pluralize": {
			"type": "object",
			"description": "Returns a localized string based on the Common Locale Data Repository (CLDR) plural category of the count (zero, one, two, few, many, other). Requires an 'other' fallback. For English, just use 'one' and 'other'.",
			"returnType": "string",
			"properties": {
				"@call": {
					"const": "pluralize"
				},
				"args": {
					"type": "object",
					"properties": {
						"value": {
							"$ref": "common_types.json#/$defs/DynamicNumber",
							"description": "The numeric value used to determine the plural category."
						},
						"zero": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "String for the 'zero' category (e.g., 0 items)."
						},
						"one": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "String for the 'one' category (e.g., 1 item)."
						},
						"two": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "String for the 'two' category (used in Arabic, Welsh, etc.)."
						},
						"few": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "String for the 'few' category (e.g., small groups in Slavic languages)."
						},
						"many": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "String for the 'many' category (e.g., large groups in various languages)."
						},
						"other": {
							"$ref": "common_types.json#/$defs/DynamicString",
							"description": "The default/fallback string (used for general plural cases)."
						}
					},
					"required": [
						"value",
						"other"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"openUrl": {
			"type": "object",
			"description": "Opens the specified URL in a browser or handler (requires user activation). This function has no return value.",
			"returnType": "void",
			"requiresUserActivation": true,
			"properties": {
				"@call": {
					"const": "openUrl"
				},
				"args": {
					"type": "object",
					"properties": {
						"url": {
							"oneOf": [
								{
									"type": "string",
									"format": "uri"
								},
								{
									"$ref": "common_types.json#/$defs/DataBinding"
								},
								{
									"$ref": "common_types.json#/$defs/FunctionCall"
								}
							],
							"description": "The URL to open."
						}
					},
					"required": [
						"url"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"and": {
			"type": "object",
			"description": "Performs a logical AND operation on a list of boolean values.",
			"returnType": "boolean",
			"properties": {
				"@call": {
					"const": "and"
				},
				"args": {
					"type": "object",
					"properties": {
						"values": {
							"type": "array",
							"items": {
								"$ref": "common_types.json#/$defs/DynamicBoolean"
							},
							"minItems": 2,
							"description": "The list of boolean values to evaluate."
						}
					},
					"required": [
						"values"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"or": {
			"type": "object",
			"description": "Performs a logical OR operation on a list of boolean values.",
			"returnType": "boolean",
			"properties": {
				"@call": {
					"const": "or"
				},
				"args": {
					"type": "object",
					"properties": {
						"values": {
							"type": "array",
							"items": {
								"$ref": "common_types.json#/$defs/DynamicBoolean"
							},
							"minItems": 2,
							"description": "The list of boolean values to evaluate."
						}
					},
					"required": [
						"values"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"not": {
			"type": "object",
			"description": "Performs a logical NOT operation on a boolean value.",
			"returnType": "boolean",
			"properties": {
				"@call": {
					"const": "not"
				},
				"args": {
					"type": "object",
					"properties": {
						"value": {
							"$ref": "common_types.json#/$defs/DynamicBoolean",
							"description": "The boolean value to negate."
						}
					},
					"required": [
						"value"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"calc": {
			"type": "object",
			"description": "The value of an arithmetic formula over named values, e.g. p * (1 + r / 100) ^ n.",
			"returnType": "number",
			"properties": {
				"@call": {
					"const": "calc"
				},
				"args": {
					"type": "object",
					"properties": {
						"expr": {
							"type": "string",
							"description": "Numbers, names from vars, + - * / % ^, comparisons, and abs ceil floor round(x, digits?) min max pow sqrt exp log log10 if(cond, a, b)."
						},
						"vars": {
							"type": "object",
							"additionalProperties": {
								"$ref": "common_types.json#/$defs/DynamicValue"
							},
							"description": "The formula's names and their values: literals, or bindings such as { \"@path\": \"/rate\" }."
						}
					},
					"required": [
						"expr"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		},
		"series": {
			"type": "object",
			"description": "Rows from a range, one per step, each column a formula: data for a Chart or rows for a Table that follow the data model.",
			"returnType": "array",
			"properties": {
				"@call": {
					"const": "series"
				},
				"args": {
					"type": "object",
					"properties": {
						"from": {
							"$ref": "common_types.json#/$defs/DynamicNumber",
							"description": "The first step."
						},
						"to": {
							"$ref": "common_types.json#/$defs/DynamicNumber",
							"description": "The last step (at most 1000 rows are made)."
						},
						"step": {
							"$ref": "common_types.json#/$defs/DynamicNumber",
							"description": "The step. Default 1."
						},
						"index": {
							"type": "string",
							"description": "The name a formula reads the step by, and the column it is written to, e.g. year."
						},
						"columns": {
							"type": "object",
							"additionalProperties": {
								"type": "string"
							},
							"description": "Column name → formula, in order; a formula may read the index, vars, the columns before it, and prev_<column>: that column in the previous row (a running balance)."
						},
						"start": {
							"type": "object",
							"additionalProperties": {
								"$ref": "common_types.json#/$defs/DynamicValue"
							},
							"description": "The first row's values for the columns named, which their prev_ reads on the second: where a running balance starts."
						},
						"vars": {
							"type": "object",
							"additionalProperties": {
								"$ref": "common_types.json#/$defs/DynamicValue"
							},
							"description": "The formula's names and their values: literals, or bindings such as { \"@path\": \"/rate\" }."
						}
					},
					"required": [
						"from",
						"to",
						"index",
						"columns"
					],
					"unevaluatedProperties": false
				}
			},
			"required": [
				"@call",
				"args"
			]
		}
	},
	"$defs": {
		"Weight": {
			"type": "number",
			"description": "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column."
		},
		"anyComponent": {
			"oneOf": [
				{
					"$ref": "#/components/Text"
				},
				{
					"$ref": "#/components/Image"
				},
				{
					"$ref": "#/components/Icon"
				},
				{
					"$ref": "#/components/Video"
				},
				{
					"$ref": "#/components/AudioPlayer"
				},
				{
					"$ref": "#/components/Row"
				},
				{
					"$ref": "#/components/Column"
				},
				{
					"$ref": "#/components/List"
				},
				{
					"$ref": "#/components/Card"
				},
				{
					"$ref": "#/components/Tabs"
				},
				{
					"$ref": "#/components/Modal"
				},
				{
					"$ref": "#/components/Divider"
				},
				{
					"$ref": "#/components/Button"
				},
				{
					"$ref": "#/components/TextField"
				},
				{
					"$ref": "#/components/CheckBox"
				},
				{
					"$ref": "#/components/ChoicePicker"
				},
				{
					"$ref": "#/components/Slider"
				},
				{
					"$ref": "#/components/DateTimeInput"
				},
				{
					"$ref": "#/components/Stat"
				},
				{
					"$ref": "#/components/Table"
				},
				{
					"$ref": "#/components/Compare"
				},
				{
					"$ref": "#/components/Callout"
				},
				{
					"$ref": "#/components/Chart"
				}
			],
			"discriminator": {
				"propertyName": "component"
			}
		},
		"anyFunction": {
			"oneOf": [
				{
					"$ref": "#/functions/required"
				},
				{
					"$ref": "#/functions/regex"
				},
				{
					"$ref": "#/functions/length"
				},
				{
					"$ref": "#/functions/numeric"
				},
				{
					"$ref": "#/functions/email"
				},
				{
					"$ref": "#/functions/formatString"
				},
				{
					"$ref": "#/functions/formatNumber"
				},
				{
					"$ref": "#/functions/formatCurrency"
				},
				{
					"$ref": "#/functions/formatDate"
				},
				{
					"$ref": "#/functions/pluralize"
				},
				{
					"$ref": "#/functions/openUrl"
				},
				{
					"$ref": "#/functions/and"
				},
				{
					"$ref": "#/functions/or"
				},
				{
					"$ref": "#/functions/not"
				},
				{
					"$ref": "#/functions/calc"
				},
				{
					"$ref": "#/functions/series"
				}
			]
		}
	}
};
