# Literature Review Companion

# Design Decisions

## Research Philosophy

### Vision

The application is a **deep reading environment** for researchers rather
than a PDF reader, reference manager, or AI assistant.

### Core Principle

> Reduce friction without reducing thought.

The software should automate repetitive work while leaving all
intellectual analysis to the researcher.

### What the App Does

-   Organizes papers
-   Stores reading progress
-   Preserves highlights and notes
-   Generates structured review summaries from user-created notes
-   Helps compare papers

### What the App Does NOT Do

-   AI summaries
-   AI-generated literature reviews
-   Automatic critiques
-   Automatic filling of research matrices

------------------------------------------------------------------------

## UI Layout

### Main Layout

-   Left 60%: PDF Reader
-   Right 40%: Research Notebook
-   Bottom: Global Status Bar

The PDF should always remain the visual focus.

### Toolbar

-   Workspace
-   Add Paper
-   Search
-   Review Matrix
-   Export
-   Settings

### Research Notebook

Accordion interface.

Only one section expands at a time.

Collapsed sections show a small preview of their contents.

Sections:

-   Metadata
-   Research Problem
-   Research Questions
-   Theory
-   Variables
-   Methodology
-   Dataset
-   Findings
-   Limitations
-   Strengths
-   Weaknesses
-   Relevance to Thesis
-   General Notes

General Notes acts as a scratchpad for ideas that do not belong in any
structured category.

------------------------------------------------------------------------

## Workspace System

Research is organized into Workspaces.

Each workspace contains:

-   SQLite database
-   Papers
-   Exports
-   Settings

Suggested structure:

    Workspace/

        database.sqlite

        papers/

        exports/

        settings.json

### Paper Import

Default behavior:

Copy the PDF into the workspace library.

Reasons:

-   Self-contained projects
-   No broken file paths
-   Portable research archive
-   Independent of Downloads folder

Duplicate papers should be detected using file hashes.

------------------------------------------------------------------------

## Research Notebook

The notebook represents the researcher's thinking.

Workflow:

Read

↓

Highlight

↓

Assign to notebook section

↓

Continue reading

Each captured excerpt stores:

-   Quote
-   Page number
-   User note

Every note remains linked to the original PDF page.

Current Thought stores a short reminder of where the researcher stopped
thinking.

------------------------------------------------------------------------

## Bottom Status Bar

A single global status bar spans the entire application.

Left: - Current page - Reading progress

Center: - Context-aware status

Examples:

-   Selected 21 words
-   Metadata imported
-   Highlight saved
-   Searching...
-   DOI resolved

Right: - Current Thought

Clicking Current Thought opens a small editor.

------------------------------------------------------------------------

## Review Matrix

The matrix is NOT used while reading.

Instead, it is generated after reading from the structured notebook.

Levels of information:

1.  Reading Environment
2.  Paper Summary
3.  Literature Matrix

The literature matrix compares many papers side by side while each paper
summary remains linked back to its PDF.

------------------------------------------------------------------------

## Development Roadmap

Milestone 00 - Project Skeleton

Milestone 01 - Workspace System

Milestone 02 - Storage Module

Milestone 03 - Library Module

Milestone 04 - PDF Reader

Milestone 05 - Reading State

Milestone 06 - Research Notebook

Milestone 07 - Annotation System

Milestone 08 - Metadata & DOI

Milestone 09 - Dictionary

Milestone 10 - Paper Summary

Milestone 11 - Literature Matrix

Milestone 12 - Search

Milestone 13 - Export

Every milestone should produce a usable application increment.

------------------------------------------------------------------------

## Future Ideas

Ideas are recorded but not implemented until promoted to a milestone.

Current ideas:

-   Hover academic dictionary
-   DOI-based paper acquisition when legally available
-   Workspace portability
-   Citation graphs
-   Plugin system
-   Reading analytics
-   Mobile companion
-   Cross-paper linking
-   Multi-monitor mode
-   Theme customization

------------------------------------------------------------------------

## Engineering Principles

-   Feature-based modular architecture
-   Stable public interfaces
-   UI → Service → Repository → SQLite
-   Offline-first
-   Autosave
-   Replaceable modules
-   Small AI prompts
-   One feature per implementation prompt
-   Design before implementation
