import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { createElement, type IconNode } from "lucide";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

export function iconDOM(lucideIcon: IconNode, size: IconSize = "md", className?: string): SVGElement {
	return createElement(lucideIcon, { class: `icon icon-${size}${className ? ` ${className}` : ""}` });
}

export function icon(lucideIcon: IconNode, size: IconSize = "md", className?: string): TemplateResult {
	return html`${unsafeHTML(iconDOM(lucideIcon, size, className).outerHTML)}`;
}
