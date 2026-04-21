import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Avatar, Badge, Button, IconButton, Panel, Tabs } from "./index";

// @ts-expect-error IconButton requires an aria-label for accessibility.
const _invalidIconButton = <IconButton>!</IconButton>;
const _validIconButton = <IconButton aria-label="Open settings">!</IconButton>;
void _invalidIconButton;
void _validIconButton;

describe("ui primitives", () => {
  it("renders Button variants", () => {
    const html = renderToStaticMarkup(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </>
    );

    expect(html).toContain("ui-button is-primary");
    expect(html).toContain("ui-button is-secondary");
    expect(html).toContain("ui-button is-ghost");
    expect(html).toContain("ui-button is-danger");
  });

  it("renders IconButton with aria-label", () => {
    const html = renderToStaticMarkup(
      <IconButton aria-label="Open room menu" variant="ghost">
        •••
      </IconButton>
    );

    expect(html).toContain('class="ui-icon-button is-ghost"');
    expect(html).toContain('aria-label="Open room menu"');
  });

  it("renders Badge tones", () => {
    const html = renderToStaticMarkup(
      <>
        <Badge tone="neutral">neutral</Badge>
        <Badge tone="green">green</Badge>
        <Badge tone="yellow">yellow</Badge>
        <Badge tone="red">red</Badge>
        <Badge tone="blue">blue</Badge>
      </>
    );

    expect(html).toContain("ui-badge tone-neutral");
    expect(html).toContain("ui-badge tone-green");
    expect(html).toContain("ui-badge tone-yellow");
    expect(html).toContain("ui-badge tone-red");
    expect(html).toContain("ui-badge tone-blue");
  });

  it("renders Avatar initials and optional color style", () => {
    const html = renderToStaticMarkup(<Avatar name="Code Agent" color="#3366FF" />);

    expect(html).toContain(">CA<");
    expect(html).toContain('style="background-color:#3366FF"');
  });

  it("renders Tabs tablist with active tab state", () => {
    const html = renderToStaticMarkup(
      <Tabs
        ariaLabel="Workspace sections"
        activeTabId="chat"
        tabs={[
          { id: "chat", label: "Chat" },
          { id: "board", label: "Board" }
        ]}
      />
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('class="ui-tab is-active"');
    expect(html).toContain('aria-selected="true"');
  });

  it("renders Panel as a titled section", () => {
    const html = renderToStaticMarkup(
      <Panel title="Room activity">
        <p>Latest updates.</p>
      </Panel>
    );

    expect(html).toContain('class="ui-panel"');
    expect(html).toContain("<h2>Room activity</h2>");
    expect(html).toContain("Latest updates.");
  });
});
