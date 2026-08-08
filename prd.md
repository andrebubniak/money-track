# Product Requirements Document

## Overview

MoneyTrack is a personal expense tracking web app. Users can log income and expenses, organize them by category and payment card, set up recurring transactions (like subscriptions, with or without an end), view a spending dashboard, and import/export their transaction history.

## Problem Statement

People who want to track personal finances often rely on generic spreadsheets or apps that don't fit their exact habits — manually re-entering recurring charges (subscriptions, rent), lacking a clear category-based view of where money goes, or being unable to bring in/export their own data. MoneyTrack solves this with a focused, lightweight tool built around real spending habits: recurring payments, categorized transactions, and a clear at-a-glance dashboard.

## Goals

- Let users track income and expenses accurately, organized by category and card.
- Automate recurring transactions (e.g., subscriptions), with or without a defined end, so users don't manually re-enter them each period.
- Give users a clear, at-a-glance view of their financial state via a dashboard.
- Let users create expense planning for events, which can be attached to transactions
- Allow users to bring in existing transaction data and export their own data at any time.
- Support user preferences (currency display, language, theme) so the app feels personal to use.
- Ship a finished, deployed, usable product rather than an open-ended feature set.

## Non-Goals

- Multi-user or shared/family accounts.
- Automatic currency conversion between currencies — currency selection affects display/formatting only, not real conversion of amounts.
- Direct bank or payment provider integrations (e.g., automatic transaction syncing).
- Notifications or reminders (email/push).
- A native mobile app.

## Target Users

- An individual who wants a simple personal tool to track their own spending and income.
- A recurring-payment-heavy user (subscriptions, rent, installments) who wants those handled automatically instead of re-entered manually.
- An individual who wants to make simple expense planning and compare it to the actual expense
- A non-English-speaking user who wants the interface in their own language.

## User Stories

- As a user, I want to register and log in (with email/password or Google), so my financial data is private to me and sign-in is convenient.
- As a user, I want to create categories, so I can organize my transactions in a way that matches my life.
- As a user, I want to add my debit/credit cards, so I can track which card each transaction belongs to.
- As a user, I want to create expense plans and compare the to my real expenses
- As a user, I want to log a transaction as income or expense, so I can track money in and out.
- As a user, I want to set up a recurring transaction (e.g., a subscription) that can run indefinitely or for a set duration, so I don't have to re-enter it every period.
- As a user, I want to see a dashboard summarizing my balance, monthly income/expenses, and spending by category, so I understand my finances at a glance.
- As a user, I want to filter my transactions by date, category, or card, so I can find what I'm looking for.
- As a user, I want to export my transactions, so I can keep my own copy of my data.
- As a user, I want to import transactions from a file, so I don't have to manually re-enter historical data.
- As a user, I want to choose my currency and how amounts are displayed, so the app matches how I think about money.
- As a user, I want to switch the app's language, so I can use it comfortably.
- As a user, I want to switch between light and dark mode, so I can use the app comfortably in different lighting.

## Functional Requirements

### Must Have

- User registration and login, including Google sign-in as an alternative to email/password.
- Create, edit, delete (deactivate) categories.
- Create, edit, delete (deactivate) cards (debit/credit).
- Create, edit, delete (deactivate) transactions, linked to a category and a card.
- Recurring transactions that can run indefinitely or for a defined duration (end date or number of occurrences), generated automatically over time.
- Dashboard showing current balance, this month's income vs. expenses, spending by category, and a summary of active recurring transactions.
- Filter transactions by date range, category, and card.
- Export transactions to a file.
- Import transactions from a file, with feedback on what succeeded or failed.
- User-selectable currency and display format (visual formatting only, not conversion).
- Multi-language interface (i18n), supporting english (USA) and brazilian portuguese initially.
- Light/dark mode toggle.

### Nice to Have

- Support for additional file formats beyond the primary export/import format.
- Budget limits per category with visual progress indicators.

## User Flow

1. User registers or logs in (email/password or Google).
2. User sets their preferences (currency/display format, language, theme).
3. User sets up their initial categories and cards.
4. User adds transactions (one-off or recurring), assigning each to a category and card.
5. User views the dashboard to see their overall financial picture.
6. User filters or searches transactions as needed.
7. User exports data, or imports existing historical data, at any point.

## Success Metrics

- All core flows (register/login, category/card/transaction management, recurring setup, dashboard, import/export, preferences) work end-to-end without errors.
- The product is fully usable by a real user for genuine personal expense tracking — not just a partial demo.
- The product is live and accessible via a public URL.
