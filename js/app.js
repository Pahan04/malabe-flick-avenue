/**
 * Malabe Flick Avenue - Front Desk Cinema Management Dashboard
 * Complete Integrated Front-End Application
 * Updated with Staff Cabin Assignment, Capacity Indicators ("Cabin XX - Cap: X") & Smart Suggestion Engine
 */

(function () {
  'use strict';

  /* ==========================================================================
     1. CONSTANTS
     ========================================================================== */

  const STORAGE_KEY_BOOKINGS = 'malabe_flick_avenue_bookings_v5';

  const CABINS = [
    { id: 'cabin-01', name: 'Cabin 01', type: 'Couples Deluxe', capacity: 2, capacityLabel: 'Cap: 2' },
    { id: 'cabin-02', name: 'Cabin 02', type: 'Couples Suite', capacity: 2, capacityLabel: 'Cap: 2' },
    { id: 'cabin-03', name: 'Cabin 03', type: 'Standard Lounge', capacity: 4, capacityLabel: 'Cap: 4' },
    { id: 'cabin-04', name: 'Cabin 04', type: 'Standard Lounge', capacity: 4, capacityLabel: 'Cap: 4' },
    { id: 'cabin-05', name: 'Cabin 05', type: 'VIP Cinema Suite', capacity: 4, capacityLabel: 'Cap: 4' },
    { id: 'cabin-06', name: 'Cabin 06', type: 'VIP Cinema Suite', capacity: 4, capacityLabel: 'Cap: 4' },
    { id: 'cabin-07', name: 'Cabin 07', type: 'Family Theater', capacity: 6, capacityLabel: 'Cap: 6' },
    { id: 'cabin-08', name: 'Cabin 08', type: 'Family Theater', capacity: 6, capacityLabel: 'Cap: 6' },
    { id: 'cabin-09', name: 'Cabin 09', type: 'Grand Royale Suite', capacity: 6, capacityLabel: 'Cap: 6' },
    { id: 'cabin-10', name: 'Cabin 10', type: 'Master Suite Dolby', capacity: 8, capacityLabel: 'Cap: 8' }
  ];

  const PRICING = {
    baseHours: 3,
    baseRate: 2500,       // Rs. 2,500 for 3 hours (standard rate for 1-4 guests)
    extraHourRate: 1000,  // Rs. 1,000 per extra hour
    baseGuests: 4,        // Standard capacity covered under base rate
    extraGuestRate: 800,  // Rs. 800 per extra person for 5+ guests
    onlineAdvance: 1000,  // Online advance amount paid
    onlineBalance: 1500,  // Remaining balance due at venue
    snacks: {
      chips: { name: 'Chips Packets', price: 350 },
      waterSmall: { name: 'Small Water Bottles', price: 100 },
      waterLarge: { name: 'Large Water Bottles', price: 150 },
      softDrink: { name: 'Cool Drinks', price: 250 }
    }
  };

  const DEFAULT_BOOKINGS = [];

  /* ==========================================================================
     2. DATA STORE
     ========================================================================== */

  class DataStore {
    constructor() {
      this.loadData();
    }

    loadData() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_BOOKINGS);
        if (stored) {
          this.bookings = JSON.parse(stored);
        } else {
          this.bookings = JSON.parse(JSON.stringify(DEFAULT_BOOKINGS));
          this.saveData();
        }
      } catch (e) {
        console.error('Error loading localStorage', e);
        this.bookings = JSON.parse(JSON.stringify(DEFAULT_BOOKINGS));
      }
    }

    saveData() {
      try {
        localStorage.setItem(STORAGE_KEY_BOOKINGS, JSON.stringify(this.bookings));
      } catch (e) {
        console.error('Error saving localStorage', e);
      }
    }

    resetToDefault() {
      this.bookings = JSON.parse(JSON.stringify(DEFAULT_BOOKINGS));
      this.saveData();
    }

    getAllBookings() {
      return this.bookings;
    }

    getBookingById(id) {
      return this.bookings.find(b => b.id === id);
    }

    addBooking(booking) {
      this.bookings.push(booking);
      this.saveData();
      return booking;
    }

    updateBooking(id, updatedFields) {
      const idx = this.bookings.findIndex(b => b.id === id);
      if (idx !== -1) {
        this.bookings[idx] = { ...this.bookings[idx], ...updatedFields };
        this.saveData();
        return this.bookings[idx];
      }
      return null;
    }

    deleteBooking(id) {
      const idx = this.bookings.findIndex(b => b.id === id);
      if (idx !== -1) {
        const removed = this.bookings.splice(idx, 1)[0];
        this.saveData();
        return removed;
      }
      return null;
    }

    getPendingOnlineRequests() {
      return this.bookings
        .filter(b => b.source === 'online' && b.status === 'pending')
        .sort((a, b) => {
          const toMin = (t) => {
            if (!t) return 0;
            const parts = t.split(':').map(Number);
            return (parts[0] || 0) * 60 + (parts[1] || 0);
          };
          const minA = toMin(a.startTime);
          const minB = toMin(b.startTime);
          if (minA !== minB) return minA - minB;
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        });
    }

    acceptOnlineRequest(id, assignedCabinId = null) {
      const bkg = this.getBookingById(id);
      if (bkg) {
        bkg.status = 'confirmed';
        if (assignedCabinId) {
          bkg.cabinId = assignedCabinId;
        }
        this.saveData();
        return bkg;
      }
      return null;
    }

    settleOnlineBalance(id, paymentMethod = 'Cash') {
      const bkg = this.getBookingById(id);
      if (bkg) {
        bkg.balanceSettled = true;
        bkg.balancePaymentMethod = paymentMethod;
        bkg.balanceSettledAt = new Date().toISOString();
        bkg.balanceSettledAmount = bkg.balanceDueAmount !== undefined ? bkg.balanceDueAmount : 1500;
        this.saveData();
        return bkg;
      }
      return null;
    }

    getCabinById(id) {
      return CABINS.find(c => c.id === id);
    }

    /**
     * Smart Suggestion Engine: Finds the best available cabin matching group capacity and time slot
     */
    findBestAvailableCabin(groupSize, startTime, durationHours, excludeBookingId = null, date = '2026-08-23') {
      const [h, m] = startTime.split(':').map(Number);
      const startMin = h * 60 + m;
      const endMin = (h + durationHours) * 60 + m;

      // Filter cabins with capacity >= groupSize, sorted by closest capacity match
      const candidateCabins = CABINS
        .filter(c => c.capacity >= groupSize)
        .sort((a, b) => a.capacity - b.capacity);

      for (const cabin of candidateCabins) {
        const hasConflict = this.bookings.some(b => {
          if (b.id === excludeBookingId) return false;
          if (b.cabinId !== cabin.id || b.date !== date) return false;
          if (b.status === 'completed') return false;

          const [bStartH, bStartM] = b.startTime.split(':').map(Number);
          const [bEndH, bEndM] = b.endTime.split(':').map(Number);
          const bStart = bStartH * 60 + bStartM;
          const bEnd = bEndH * 60 + bEndM;

          return startMin < bEnd && endMin > bStart;
        });

        if (!hasConflict) {
          return cabin;
        }
      }

      // If no exact fit is available, check any available cabin that fits
      for (const cabin of CABINS) {
        const hasConflict = this.bookings.some(b => {
          if (b.id === excludeBookingId) return false;
          if (b.cabinId !== cabin.id || b.date !== date) return false;
          if (b.status === 'completed') return false;

          const [bStartH, bStartM] = b.startTime.split(':').map(Number);
          const [bEndH, bEndM] = b.endTime.split(':').map(Number);
          const bStart = bStartH * 60 + bStartM;
          const bEnd = bEndH * 60 + bEndM;

          return startMin < bEnd && endMin > bStart;
        });

        if (!hasConflict) {
          return cabin;
        }
      }

      return null;
    }
  }

  /* ==========================================================================
     3. PRICING & FINANCIAL CALCULATOR
     ========================================================================== */

  class Calculator {
    static calculateBookingTotal(booking) {
      const guestCount = Number(booking.guestCount) || 2;
      const baseGuests = PRICING.baseGuests || 4;
      const extraGuests = Math.max(0, guestCount - baseGuests);
      const extraGuestsAmount = extraGuests * (PRICING.extraGuestRate || 800);

      const duration = Number(booking.durationHours) || 3;
      const baseHours = PRICING.baseHours;
      const extraHours = Math.max(0, duration - baseHours);

      const cabinBaseAmount = PRICING.baseRate;
      const cabinExtraAmount = extraHours * PRICING.extraHourRate;
      const cabinTotalAmount = cabinBaseAmount + cabinExtraAmount + extraGuestsAmount;

      let beverageTotalAmount = 0;
      let beverageCashAmount = 0;
      let beverageCardAmount = 0;

      const snackBreakdown = {};

      if (booking.snacks) {
        for (const [key, item] of Object.entries(booking.snacks)) {
          const pricingInfo = PRICING.snacks[key];
          if (pricingInfo && item.qty > 0) {
            const itemTotal = item.qty * pricingInfo.price;
            beverageTotalAmount += itemTotal;

            if (item.paymentMethod === 'Cash') {
              beverageCashAmount += itemTotal;
            } else {
              beverageCardAmount += itemTotal;
            }

            snackBreakdown[key] = {
              name: pricingInfo.name,
              qty: item.qty,
              unitPrice: pricingInfo.price,
              totalPrice: itemTotal,
              paymentMethod: item.paymentMethod || 'Cash'
            };
          }
        }
      }

      const grandTotal = cabinTotalAmount + beverageTotalAmount;

      // Online payment handling
      const isOnline = booking.source === 'online';
      const paymentStatus = booking.paymentStatus || (isOnline ? 'advance' : 'full');
      const isAdvancePaid = isOnline && paymentStatus === 'advance';

      let onlineAdvancePaid = 0;
      let balanceDueAmount = 0;
      let balanceSettled = false;
      let balancePaymentMethod = booking.balancePaymentMethod || 'Cash';

      if (isOnline) {
        if (isAdvancePaid) {
          onlineAdvancePaid = PRICING.onlineAdvance || 1000;
          balanceDueAmount = (PRICING.onlineBalance || 1500) + cabinExtraAmount + extraGuestsAmount;
          balanceSettled = !!booking.balanceSettled;
        } else {
          // Full payment online
          onlineAdvancePaid = grandTotal;
          balanceDueAmount = 0;
          balanceSettled = true;
        }
      }

      // Cash vs Card breakdown for Front Desk
      let cabinCashAmount = 0;
      let cabinCardAmount = 0;

      if (!isOnline) {
        // Direct bookings are paid in full at front desk
        cabinCashAmount = booking.cabinPaymentMethod === 'Cash' ? cabinTotalAmount : 0;
        cabinCardAmount = booking.cabinPaymentMethod === 'Card' ? cabinTotalAmount : 0;
      } else if (isAdvancePaid && balanceSettled) {
        // Online booking with settled balance paid at front desk
        if (balancePaymentMethod === 'Card') {
          cabinCardAmount = balanceDueAmount;
        } else {
          cabinCashAmount = balanceDueAmount;
        }
      }

      const totalCash = cabinCashAmount + beverageCashAmount;
      const totalCard = cabinCardAmount + beverageCardAmount;

      return {
        guestCount,
        extraGuests,
        extraGuestsAmount,
        durationHours: duration,
        extraHours,
        cabinBaseAmount,
        cabinExtraAmount,
        cabinTotalAmount,
        cabinPaymentMethod: booking.cabinPaymentMethod,
        isOnline,
        paymentStatus,
        isAdvancePaid,
        onlineAdvancePaid,
        balanceDueAmount,
        balanceSettled,
        balancePaymentMethod,
        cabinCashAmount,
        cabinCardAmount,
        beverageTotalAmount,
        beverageCashAmount,
        beverageCardAmount,
        snackBreakdown,
        totalCash,
        totalCard,
        grandTotal
      };
    }

    static generateDailyReport(bookings, selectedDate = '2026-08-23') {
      const validBookings = bookings.filter(b => 
        b.date === selectedDate && (
          b.status === 'confirmed' || 
          b.status === 'active' || 
          b.status === 'completed' || 
          (b.source === 'online' && b.balanceSettled)
        )
      );

      let cabinCashTotal = 0;
      let cabinCardTotal = 0;
      let onlineSettledCashTotal = 0;
      let onlineSettledCardTotal = 0;
      let onlinePrepaidFullTotal = 0;
      let onlinePrepaidAdvanceTotal = 0;
      let onlineUnsettledBalanceTotal = 0;
      let beverageCashTotal = 0;
      let beverageCardTotal = 0;

      const itemizedSnacks = {
        chips: { name: 'Chips Packets', unitPrice: 350, totalQty: 0, cashQty: 0, cardQty: 0, cashTotal: 0, cardTotal: 0, totalRevenue: 0 },
        waterSmall: { name: 'Small Water Bottles (500ml)', unitPrice: 80, totalQty: 0, cashQty: 0, cardQty: 0, cashTotal: 0, cardTotal: 0, totalRevenue: 0 },
        waterLarge: { name: 'Large Water Bottles (1.5L)', unitPrice: 180, totalQty: 0, cashQty: 0, cardQty: 0, cashTotal: 0, cardTotal: 0, totalRevenue: 0 },
        popcorn: { name: 'Gourmet Popcorn Tub', unitPrice: 500, totalQty: 0, cashQty: 0, cardQty: 0, cashTotal: 0, cardTotal: 0, totalRevenue: 0 },
        softDrink: { name: 'Chilled Soft Drink (500ml)', unitPrice: 250, totalQty: 0, cashQty: 0, cardQty: 0, cashTotal: 0, cardTotal: 0, totalRevenue: 0 }
      };

      let totalDurationHours = 0;
      const cabinStats = {};
      CABINS.forEach(c => {
        cabinStats[c.id] = { name: `${c.name} - Cap: ${c.capacity}`, bookingsCount: 0, hoursBooked: 0, revenue: 0 };
      });

      // Track itemized online request bookings for the dedicated audit log table
      const onlineBookingsOnDate = bookings.filter(b => b.source === 'online' && b.date === selectedDate);
      const onlineBookingsList = [];

      onlineBookingsOnDate.forEach(b => {
        const calc = this.calculateBookingTotal(b);
        const cabin = CABINS.find(c => c.id === b.cabinId) || { name: b.cabinId, capacity: b.guestCount || 2 };

        let tillImpactCash = 0;
        let tillImpactCard = 0;
        let excludedAmount = 0;

        if (calc.isAdvancePaid) {
          excludedAmount = calc.onlineAdvancePaid || 1000;
          if (calc.balanceSettled) {
            if (calc.balancePaymentMethod === 'Card') {
              tillImpactCard = calc.balanceDueAmount || 1500;
            } else {
              tillImpactCash = calc.balanceDueAmount || 1500;
            }
          }
        } else {
          // Full payment online: 100% excluded from venue sales
          excludedAmount = calc.grandTotal || 2500;
        }

        onlineBookingsList.push({
          id: b.id,
          customerName: b.customerName,
          phone: b.phone,
          nic1: b.nic1,
          cabinId: b.cabinId,
          cabinName: cabin.name,
          startTime: b.startTime,
          endTime: b.endTime,
          guestCount: calc.guestCount,
          durationHours: calc.durationHours,
          paymentStatus: calc.paymentStatus,
          isAdvancePaid: calc.isAdvancePaid,
          onlineAdvancePaid: calc.onlineAdvancePaid,
          balanceDueAmount: calc.balanceDueAmount,
          balanceSettled: calc.balanceSettled,
          balancePaymentMethod: calc.balancePaymentMethod,
          balanceSettledAt: b.balanceSettledAt,
          status: b.status,
          tillImpactCash,
          tillImpactCard,
          excludedAmount
        });
      });

      validBookings.forEach(b => {
        const calc = this.calculateBookingTotal(b);

        if (b.source === 'online') {
          if (calc.isAdvancePaid) {
            // Online advance amount is NOT in venue daily sales report
            onlinePrepaidAdvanceTotal += calc.onlineAdvancePaid;
            if (calc.balanceSettled) {
              // Settled balance of Rs. 1,500 IS included in daily sales report
              if (calc.balancePaymentMethod === 'Card') {
                onlineSettledCardTotal += calc.balanceDueAmount;
              } else {
                onlineSettledCashTotal += calc.balanceDueAmount;
              }
            } else {
              onlineUnsettledBalanceTotal += calc.balanceDueAmount;
            }
          } else {
            // Full online payment (Rs. 2,500) is NOT included in venue daily sales report
            onlinePrepaidFullTotal += calc.grandTotal;
          }
        } else {
          // Direct booking
          cabinCashTotal += calc.cabinCashAmount;
          cabinCardTotal += calc.cabinCardAmount;
        }

        // Concessions at venue
        beverageCashTotal += calc.beverageCashAmount;
        beverageCardTotal += calc.beverageCardAmount;

        totalDurationHours += calc.durationHours;

        if (cabinStats[b.cabinId]) {
          cabinStats[b.cabinId].bookingsCount += 1;
          cabinStats[b.cabinId].hoursBooked += calc.durationHours;
          cabinStats[b.cabinId].revenue += calc.cabinTotalAmount;
        }

        if (b.snacks) {
          for (const [key, item] of Object.entries(b.snacks)) {
            if (itemizedSnacks[key] && item.qty > 0) {
              const price = itemizedSnacks[key].unitPrice;
              const revenue = item.qty * price;

              itemizedSnacks[key].totalQty += item.qty;
              itemizedSnacks[key].totalRevenue += revenue;

              if (item.paymentMethod === 'Cash') {
                itemizedSnacks[key].cashQty += item.qty;
                itemizedSnacks[key].cashTotal += revenue;
              } else {
                itemizedSnacks[key].cardQty += item.qty;
                itemizedSnacks[key].cardTotal += revenue;
              }
            }
          }
        }
      });

      const totalCashRevenue = cabinCashTotal + onlineSettledCashTotal + beverageCashTotal;
      const totalCardRevenue = cabinCardTotal + onlineSettledCardTotal + beverageCardTotal;
      const grandTotalRevenue = totalCashRevenue + totalCardRevenue;

      return {
        date: selectedDate,
        bookingsCount: validBookings.length,
        cabinCashTotal,
        cabinCardTotal,
        cabinGrandTotal: cabinCashTotal + cabinCardTotal,
        onlineSettledCashTotal,
        onlineSettledCardTotal,
        onlineSettledGrandTotal: onlineSettledCashTotal + onlineSettledCardTotal,
        onlinePrepaidFullTotal,
        onlinePrepaidAdvanceTotal,
        onlineUnsettledBalanceTotal,
        totalOnlinePrepaidExcluded: onlinePrepaidFullTotal + onlinePrepaidAdvanceTotal,
        beverageCashTotal,
        beverageCardTotal,
        beverageGrandTotal: beverageCashTotal + beverageCardTotal,
        totalCashRevenue,
        totalCardRevenue,
        grandTotalRevenue,
        itemizedSnacks,
        cabinStats,
        onlineBookingsList,
        validBookings
      };
    }

    static formatCurrency(amount) {
      return 'Rs. ' + (amount || 0).toLocaleString('en-US');
    }
  }

  /* ==========================================================================
     4. GANTT TIMELINE MATRIX ENGINE
     ========================================================================== */

  class TimelineGrid {
    constructor(containerElement, dataStore, options = {}) {
      this.container = containerElement;
      this.dataStore = dataStore;
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      this.options = {
        startHour: 9,      // 09:00 AM
        endHour: 24,       // 12:00 AM Midnight (24:00)
        slotMinutes: 30,
        currentDate: todayStr,
        ...options
      };

      this.onBookingClick = options.onBookingClick || (() => {});
      this.onEmptySlotClick = options.onEmptySlotClick || (() => {});
      this.filterQuery = '';

      this.init();
    }

    init() {
      this.renderHeader();
      this.renderGrid();
      this.updateCurrentTimeIndicator();
    }

    timeToMinutes(timeStr) {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      const startMinutes = this.options.startHour * 60;
      const currentMinutes = h * 60 + (m || 0);
      return Math.max(0, currentMinutes - startMinutes);
    }

    minutesToTime(minutes) {
      const totalMinutes = this.options.startHour * 60 + minutes;
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    formatTime12h(timeStr) {
      if (!timeStr) return '';
      let [h, m] = timeStr.split(':').map(Number);
      if (h === 24) return '12:00 AM';
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHour = h % 12 || 12;
      return `${displayHour}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    calculatePosition(startTime, endTime) {
      const totalDayMinutes = (this.options.endHour - this.options.startHour) * 60;
      const startMinutes = this.timeToMinutes(startTime);
      const endMinutes = this.timeToMinutes(endTime);
      const durationMinutes = Math.max(15, endMinutes - startMinutes);

      const left = (startMinutes / totalDayMinutes) * 100;
      const width = (durationMinutes / totalDayMinutes) * 100;

      return { left: `${Math.max(0, left)}%`, width: `${Math.min(100 - left, width)}%` };
    }

    isBookingActive(booking, currentHour, currentMinute, todayStr) {
      if (booking.status === 'pending' || booking.status === 'completed') return false;
      if (todayStr && booking.date !== todayStr) return false;
      const currentTotalMin = currentHour * 60 + currentMinute;
      const [startH, startM] = booking.startTime.split(':').map(Number);
      const [endH, endM] = booking.endTime.split(':').map(Number);
      const startTotalMin = startH * 60 + startM;
      const endTotalMin = endH * 60 + endM;

      return currentTotalMin >= startTotalMin && currentTotalMin < endTotalMin;
    }

    getRemainingTimeString(booking, currentHour, currentMinute) {
      const currentTotalMin = currentHour * 60 + currentMinute;
      const [endH, endM] = booking.endTime.split(':').map(Number);
      const endTotalMin = endH * 60 + endM;
      const diff = Math.max(0, endTotalMin - currentTotalMin);
      const hrs = Math.floor(diff / 60);
      const mins = diff % 60;
      if (hrs > 0) return `${hrs}h ${mins}m left`;
      return `${mins}m left`;
    }

    renderHeader() {
      const totalSlots = (this.options.endHour - this.options.startHour) * 2;
      let slotsHtml = '';

      for (let i = 0; i < totalSlots; i++) {
        const slotMin = i * 30;
        const timeStr = this.minutesToTime(slotMin);
        const isHour = slotMin % 60 === 0;
        const formatted = this.formatTime12h(timeStr);

        slotsHtml += `
          <div class="flex-1 min-w-[65px] px-1 py-2 text-center text-xs select-none ${isHour ? 'font-semibold text-slate-200 bg-slate-800/40 border-r border-slate-700/50' : 'text-slate-400 border-r border-slate-800/40'}">
            ${isHour ? `<span>${formatted}</span>` : `<span class="text-[10px] text-slate-500">:30</span>`}
          </div>
        `;
      }

      const headerElement = document.getElementById('timeline-time-header');
      if (headerElement) {
        headerElement.innerHTML = slotsHtml;
      }
    }

    renderGrid(currentTimeOverride) {
      const now = currentTimeOverride || new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const bookings = this.dataStore.getAllBookings();
      const gridBody = document.getElementById('timeline-grid-body');
      if (!gridBody) return;

      let rowsHtml = '';
      const totalSlots = (this.options.endHour - this.options.startHour) * 2;

      CABINS.forEach(cabin => {
        const cabinBookings = bookings.filter(b => b.cabinId === cabin.id && b.date === this.options.currentDate);

        const activeBooking = cabinBookings.find(b => this.isBookingActive(b, currentHour, currentMinute, todayStr));
        const hasPending = cabinBookings.some(b => b.status === 'pending');

        let statusBadge = '';
        if (activeBooking) {
          statusBadge = '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">● In Session</span>';
        } else if (hasPending) {
          statusBadge = '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">● Reserved</span>';
        } else {
          statusBadge = '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">● Available</span>';
        }

        let bgCellsHtml = '';
        for (let i = 0; i < totalSlots; i++) {
          const slotMin = i * 30;
          const timeStr = this.minutesToTime(slotMin);
          const isHour = slotMin % 60 === 0;

          bgCellsHtml += `
            <div class="flex-1 min-w-[65px] h-full empty-slot-guide ${isHour ? 'timeline-grid-line-hour' : 'timeline-grid-line'}" 
                 data-cabin-id="${cabin.id}" 
                 data-cabin-name="${cabin.name}" 
                 data-slot-time="${timeStr}"
                 title="Click to assign ${cabin.name} (Cap: ${cabin.capacity}) at ${this.formatTime12h(timeStr)}">
            </div>
          `;
        }

        let bookingCardsHtml = '';
        cabinBookings.forEach(booking => {
          if (this.filterQuery) {
            const q = this.filterQuery.toLowerCase();
            const matches = booking.customerName.toLowerCase().includes(q) ||
                            booking.phone.includes(q) ||
                            (booking.nic1 && booking.nic1.includes(q)) ||
                            (booking.nic2 && booking.nic2.includes(q)) ||
                            booking.id.toLowerCase().includes(q);
            if (!matches) return;
          }

          const { left, width } = this.calculatePosition(booking.startTime, booking.endTime);
          const isActive = this.isBookingActive(booking, currentHour, currentMinute, todayStr);
          const isPending = booking.status === 'pending';

          const calc = Calculator.calculateBookingTotal(booking);
          const remainingTimeStr = isActive ? this.getRemainingTimeString(booking, currentHour, currentMinute) : '';

          let cardClass = 'booking-card-confirmed';
          let statusTag = '';

          if (isPending) {
            cardClass = 'booking-card-pending';
            const balInfo = booking.paymentStatus === 'advance' ? ` • ${Calculator.formatCurrency(calc.balanceDueAmount)} Bal` : '';
            statusTag = `<span class="bg-amber-950/90 text-amber-300 border border-amber-500/50 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider">⏳ SOFT BLOCK${balInfo}</span>`;
          } else if (isActive) {
            cardClass = 'booking-card-active';
            statusTag = `<span class="bg-cyan-950/90 text-cyan-300 border border-cyan-400 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span> ${remainingTimeStr}</span>`;
          } else if (booking.source === 'online') {
            if (booking.paymentStatus === 'advance') {
              if (booking.balanceSettled) {
                statusTag = `<span class="bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[9px] font-semibold px-1.5 py-0.5 rounded">✓ Bal Paid (${booking.balancePaymentMethod || 'Cash'})</span>`;
              } else {
                statusTag = `<span class="bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[9px] font-semibold px-1.5 py-0.5 rounded">⏳ ${Calculator.formatCurrency(calc.balanceDueAmount)} Bal Due</span>`;
              }
            } else {
              statusTag = `<span class="bg-purple-950/80 text-purple-300 border border-purple-500/40 text-[9px] font-semibold px-1.5 py-0.5 rounded">✨ Full Online</span>`;
            }
          } else {
            statusTag = `<span class="bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[9px] font-semibold px-1.5 py-0.5 rounded">${booking.cabinPaymentMethod}</span>`;
          }

          const guestBadge = (booking.guestCount && booking.guestCount >= 5) 
            ? `<span class="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 py-0.2 rounded font-mono" title="${booking.guestCount} People (Dynamic Extra Charge Applied)">👥 ${booking.guestCount}</span>` 
            : `<span class="text-[10px] bg-slate-900/60 text-slate-300 px-1 py-0.2 rounded font-mono">👥 ${booking.guestCount || 2}</span>`;

          const snackCount = booking.snacks ? Object.values(booking.snacks).reduce((acc, s) => acc + (s.qty || 0), 0) : 0;
          const snackBadge = snackCount > 0 ? `<span class="text-[10px] bg-slate-900/70 text-slate-300 px-1.5 py-0.5 rounded-full border border-slate-700/60" title="${snackCount} Snacks">🍿 ${snackCount}</span>` : '';

          bookingCardsHtml += `
            <div class="absolute top-1.5 bottom-1.5 rounded-lg px-2.5 py-1.5 flex flex-col justify-between overflow-hidden cursor-pointer select-none ${cardClass}"
                 style="left: ${left}; width: ${width};"
                 data-booking-id="${booking.id}"
                 title="${booking.customerName} - ${booking.guestCount || 2} Guests (${this.formatTime12h(booking.startTime)} - ${this.formatTime12h(booking.endTime)})">
              
              <div class="flex items-center justify-between gap-1 w-full overflow-hidden">
                <div class="flex items-center gap-1.5 truncate">
                  <span class="font-bold text-xs truncate leading-tight">${booking.customerName}</span>
                  ${guestBadge}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  ${statusTag}
                </div>
              </div>

              <div class="flex items-center justify-between text-[11px] font-mono mt-0.5 w-full opacity-90">
                <div class="flex items-center gap-1.5 truncate">
                  <span>${this.formatTime12h(booking.startTime)} - ${this.formatTime12h(booking.endTime)}</span>
                  <span class="opacity-70 text-[10px]">(${booking.durationHours}h)</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 font-sans">
                  ${snackBadge}
                  <span class="font-bold font-mono text-[11px]">${Calculator.formatCurrency(calc.grandTotal)}</span>
                </div>
              </div>
            </div>
          `;
        });

        rowsHtml += `
          <div class="flex items-stretch cabin-row relative" data-cabin-id="${cabin.id}">
            <!-- Sticky Cabin Left Column with Capacity Display -->
            <div class="cabin-sticky-col w-48 shrink-0 p-3 flex flex-col justify-center gap-1">
              <div class="flex items-center justify-between">
                <span class="font-bold text-sm text-slate-100">${cabin.name}</span>
                <span class="bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold">Cap: ${cabin.capacity}</span>
              </div>
              <div class="flex items-center justify-between text-[11px] text-slate-400">
                <span class="truncate">${cabin.type}</span>
                ${statusBadge}
              </div>
            </div>

            <!-- Timeline Tracks -->
            <div class="flex-1 relative flex">
              ${bgCellsHtml}

              <div class="absolute inset-0 pointer-events-none">
                <div class="relative w-full h-full pointer-events-auto">
                  ${bookingCardsHtml}
                </div>
              </div>
            </div>
          </div>
        `;
      });

      gridBody.innerHTML = rowsHtml;
      this.attachEventListeners();
      this.updateCurrentTimeIndicator(currentTimeOverride);
    }

    attachEventListeners() {
      const cards = this.container.querySelectorAll('[data-booking-id]');
      cards.forEach(card => {
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          const bookingId = card.getAttribute('data-booking-id');
          this.onBookingClick(bookingId);
        });
      });

      const slots = this.container.querySelectorAll('.empty-slot-guide');
      slots.forEach(slot => {
        slot.addEventListener('click', (e) => {
          const cabinId = slot.getAttribute('data-cabin-id');
          const cabinName = slot.getAttribute('data-cabin-name');
          const slotTime = slot.getAttribute('data-slot-time');
          this.onEmptySlotClick({ cabinId, cabinName, slotTime });
        });
      });
    }

    updateCurrentTimeIndicator(currentTimeOverride) {
      const now = currentTimeOverride || new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      const indicator = document.getElementById('current-time-indicator');
      const badge = document.getElementById('current-time-badge');

      if (!indicator) return;

      if (currentHour >= this.options.startHour && currentHour < this.options.endHour) {
        const currentTotalMin = currentHour * 60 + currentMinute;
        const startTotalMin = this.options.startHour * 60;
        const offsetMinutes = currentTotalMin - startTotalMin;

        const slotIndex = Math.floor(offsetMinutes / this.options.slotMinutes);
        const slotFraction = (offsetMinutes % this.options.slotMinutes) / this.options.slotMinutes;

        const headerEl = document.getElementById('timeline-time-header');
        const slotEl = headerEl ? headerEl.children[slotIndex] : null;

        indicator.style.display = 'block';

        if (slotEl) {
          // Measure the actual rendered column so the line lines up exactly
          // with the time header/grid, even if columns stretch or overflow.
          const pixelLeft = slotEl.offsetLeft + slotEl.offsetWidth * slotFraction;
          indicator.style.left = `${pixelLeft}px`;
        } else {
          // Fallback for edge cases (e.g. header not yet rendered)
          const totalDayMinutes = (this.options.endHour - this.options.startHour) * 60;
          const leftPercent = (offsetMinutes / totalDayMinutes) * 100;
          const stickyWidth = 192;
          indicator.style.left = `calc(${stickyWidth}px + (100% - ${stickyWidth}px) * ${leftPercent / 100})`;
        }

        const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
        if (badge) {
          badge.textContent = `NOW ${this.formatTime12h(timeStr)}`;
        }
      } else {
        indicator.style.display = 'none';
      }
    }

    setSearchQuery(query) {
      this.filterQuery = query;
      this.renderGrid();
    }

    refresh() {
      this.renderGrid();
    }
  }

  /* ==========================================================================
     5. TOAST NOTIFICATIONS
     ========================================================================== */

  class ToastService {
    constructor() {
      this.container = document.getElementById('toast-container');
    }

    show(message, type = 'info') {
      if (!this.container) return;

      const toast = document.createElement('div');
      const bgColors = {
        success: 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100',
        error: 'bg-rose-950/90 border-rose-500/60 text-rose-100',
        warning: 'bg-amber-950/90 border-amber-500/60 text-amber-100',
        info: 'bg-slate-900/95 border-cyan-500/60 text-cyan-100'
      };

      const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠️',
        info: 'ℹ️'
      };

      toast.className = `toast-item flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md text-sm ${bgColors[type] || bgColors.info}`;
      toast.innerHTML = `
        <span class="text-base font-bold">${icons[type] || '•'}</span>
        <span class="font-medium">${message}</span>
      `;

      this.container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.classList.add('show');
      });

      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    success(msg) { this.show(msg, 'success'); }
    error(msg) { this.show(msg, 'error'); }
    warning(msg) { this.show(msg, 'warning'); }
    info(msg) { this.show(msg, 'info'); }
  }

  /* ==========================================================================
     6. MODALS & FORMS CONTROLLER
     ========================================================================== */

  class ModalController {
    constructor(dataStore, timelineGrid, toastService) {
      this.dataStore = dataStore;
      this.timelineGrid = timelineGrid;
      this.toast = toastService;

      this.activeBookingId = null;
      this.isEditMode = false;

      this.initElements();
      this.bindEvents();
    }

    initElements() {
      this.bookingModal = document.getElementById('booking-modal');
      this.onlineReqModal = document.getElementById('online-request-modal');
      this.salesReportModal = document.getElementById('sales-report-modal');
      this.powerCutModal = document.getElementById('power-cut-modal');
      this.powerCutMinutesInput = document.getElementById('power-cut-minutes-input');

      this.bookingForm = document.getElementById('booking-form');
      this.bookingModalTitle = document.getElementById('booking-modal-title');
      this.bookingIdInput = document.getElementById('booking-id-input');
      this.cabinSelect = document.getElementById('booking-cabin-select');
      this.customerNameInput = document.getElementById('booking-customer-name');
      this.nic1Input = document.getElementById('booking-nic1');
      this.nic2Input = document.getElementById('booking-nic2');
      this.phoneInput = document.getElementById('booking-phone');
      this.guestSelect = document.getElementById('booking-guests');
      this.startTimeSelect = document.getElementById('booking-start-time');
      this.durationSelect = document.getElementById('booking-duration');
      this.endTimeDisplay = document.getElementById('booking-end-time-display');
      this.cabinPaymentCashRadio = document.getElementById('pay-cabin-cash');
      this.cabinPaymentCardRadio = document.getElementById('pay-cabin-card');
      this.notesInput = document.getElementById('booking-notes');
      this.conflictAlert = document.getElementById('booking-conflict-alert');
      this.deleteBtn = document.getElementById('booking-delete-btn');
      this.earlyCheckoutBtn = document.getElementById('booking-early-checkout-btn');
      this.acceptCheckinBtn = document.getElementById('booking-accept-checkin-btn');

      this.onlineSettlementSection = document.getElementById('booking-online-settlement-section');
      this.onlineSettlementContent = document.getElementById('booking-online-settlement-content');
      this.onlineStatusBadge = document.getElementById('booking-online-status-badge');

      // Populate Cabin Options
      this.populateCabinDropdown(this.cabinSelect);

      // Populate Start Time Options (09:00 to 21:00)
      if (this.startTimeSelect) {
        let optionsHtml = '';
        for (let h = 9; h <= 21; h++) {
          for (let m of [0, 30]) {
            if (h === 21 && m === 30) continue;
            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            const formatted = this.timelineGrid.formatTime12h(timeStr);
            optionsHtml += `<option value="${timeStr}">${formatted}</option>`;
          }
        }
        this.startTimeSelect.innerHTML = optionsHtml;
      }
    }

    populateCabinDropdown(selectEl) {
      if (!selectEl) return;
      selectEl.innerHTML = CABINS.map(c => 
        `<option value="${c.id}">${c.name} (${c.type})</option>`
      ).join('');
    }

    bindEvents() {
      if (this.guestSelect) {
        this.guestSelect.addEventListener('change', () => {
          this.updateLiveTotals();
          if (this.isEditMode && this.activeBookingId) {
            const formData = this.getFormData();
            if (formData.source === 'online') {
              this.renderEditOnlineSettlementContent(formData);
            }
          }
        });
      }

      if (this.startTimeSelect) {
        this.startTimeSelect.addEventListener('change', () => {
          this.updateCalculatedEndTime();
          this.updateLiveTotals();
          this.checkForConflicts();
        });
      }

      if (this.durationSelect) {
        this.durationSelect.addEventListener('change', () => {
          this.updateCalculatedEndTime();
          this.updateLiveTotals();
          this.checkForConflicts();
          if (this.isEditMode && this.activeBookingId) {
            const formData = this.getFormData();
            if (formData.source === 'online') {
              this.renderEditOnlineSettlementContent(formData);
            }
          }
        });
      }

      if (this.cabinSelect) {
        this.cabinSelect.addEventListener('change', () => {
          this.checkForConflicts();
        });
      }

      const cabinPayRadios = document.querySelectorAll('input[name="cabin-payment"]');
      cabinPayRadios.forEach(r => {
        r.addEventListener('change', () => {
          this.updateLiveTotals();
          r.blur();
        });
      });

      document.querySelectorAll('.snack-qty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemKey = btn.getAttribute('data-item');
          const change = parseInt(btn.getAttribute('data-change'), 10);
          const qtySpan = document.getElementById(`snack-qty-${itemKey}`);
          if (qtySpan) {
            let current = parseInt(qtySpan.textContent, 10) || 0;
            current = Math.max(0, current + change);
            qtySpan.textContent = current;
            this.updateLiveTotals();
          }
        });
      });

      document.querySelectorAll('.snack-pay-toggle').forEach(toggle => {
        toggle.addEventListener('change', () => {
          this.updateLiveTotals();
          toggle.blur();
        });
      });

      const editOnlinePayRadios = document.querySelectorAll('input[name="edit-online-payment-status"]');
      editOnlinePayRadios.forEach(radio => {
        radio.addEventListener('change', () => {
          if (this.isEditMode && this.activeBookingId) {
            const booking = this.dataStore.getBookingById(this.activeBookingId);
            if (booking) {
              this.renderEditOnlineSettlementContent(booking, radio.value);
              this.updateLiveTotals();
            }
          }
        });
      });

      if (this.bookingForm) {
        this.bookingForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleSaveBooking();
        });
      }

      if (this.deleteBtn) {
        this.deleteBtn.addEventListener('click', () => {
          this.handleDeleteBooking();
        });
      }

      if (this.earlyCheckoutBtn) {
        this.earlyCheckoutBtn.addEventListener('click', () => {
          this.handleEarlyCheckout();
        });
      }

      if (this.acceptCheckinBtn) {
        this.acceptCheckinBtn.addEventListener('click', () => {
          if (this.activeBookingId) {
            const assignedCabinId = this.cabinSelect ? this.cabinSelect.value : null;
            const bkg = this.dataStore.getBookingById(this.activeBookingId);
            this.dataStore.acceptOnlineRequest(this.activeBookingId, assignedCabinId);
            const cabin = this.dataStore.getCabinById(assignedCabinId || (bkg ? bkg.cabinId : ''));
            this.toast.success(`Booking for ${bkg ? bkg.customerName : 'Guest'} confirmed & checked into ${cabin ? cabin.name : 'suite'}!`);
            this.closeAllModals();
            this.timelineGrid.refresh();
            window.renderSidebarRequests && window.renderSidebarRequests();
          }
        });
      }

      document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.closeAllModals();
        });
      });

      [this.bookingModal, this.onlineReqModal, this.salesReportModal, this.powerCutModal].forEach(modal => {
        if (modal) {
          modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeAllModals();
          });
        }
      });

      const reportDateInput = document.getElementById('report-date-input');
      if (reportDateInput) {
        reportDateInput.addEventListener('change', () => {
          this.renderSalesReport(reportDateInput.value);
        });
      }

      const powerCutBtn = document.getElementById('btn-power-cut');
      if (powerCutBtn && this.powerCutModal) {
        powerCutBtn.addEventListener('click', () => {
          if (this.powerCutMinutesInput) this.powerCutMinutesInput.value = '';
          this.powerCutModal.classList.remove('hidden');
          if (this.powerCutMinutesInput) this.powerCutMinutesInput.focus();
        });
      }

      const applyPowerCutBtn = document.getElementById('btn-apply-power-cut');
      if (applyPowerCutBtn) {
        applyPowerCutBtn.addEventListener('click', () => {
          this.handleApplyPowerCut();
        });
      }

      if (this.powerCutMinutesInput) {
        this.powerCutMinutesInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.handleApplyPowerCut();
          }
        });
      }
    }

    handleApplyPowerCut() {
      const minutes = parseInt(this.powerCutMinutesInput ? this.powerCutMinutesInput.value : '', 10);
      if (!minutes || minutes <= 0) {
        this.toast.warning('Please enter a valid number of minutes.');
        return;
      }

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const bookings = this.dataStore.getAllBookings();
      const activeBookings = bookings.filter(b => this.timelineGrid.isBookingActive(b, currentHour, currentMinute, todayStr));

      if (activeBookings.length === 0) {
        this.toast.info('No bookings are currently active right now — nothing to extend.');
        this.closeAllModals();
        return;
      }

      activeBookings.forEach(b => {
        const [h, m] = b.endTime.split(':').map(Number);
        let totalMin = h * 60 + m + minutes;
        const maxMin = 24 * 60; // Operating hours end at 12:00 AM (midnight)
        if (totalMin > maxMin) totalMin = maxMin;
        const newH = Math.floor(totalMin / 60);
        const newM = totalMin % 60;
        const newEndTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
        this.dataStore.updateBooking(b.id, { endTime: newEndTime });
      });

      this.toast.success(`Power cut adjustment applied: +${minutes} min added to ${activeBookings.length} active booking${activeBookings.length > 1 ? 's' : ''}.`);
      this.closeAllModals();
      this.timelineGrid.refresh();
    }

    updateCalculatedEndTime() {
      const startTime = this.startTimeSelect.value || '09:00';
      const duration = parseInt(this.durationSelect.value, 10) || 3;
      const [h, m] = startTime.split(':').map(Number);
      const endH = h + duration;
      const endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const formatted = this.timelineGrid.formatTime12h(endTime);
      if (this.endTimeDisplay) {
        this.endTimeDisplay.textContent = `${formatted} (${endTime})`;
      }
      return endTime;
    }

    getFormData() {
      const durationHours = parseInt(this.durationSelect.value, 10) || 3;
      const guestCount = parseInt(this.guestSelect ? this.guestSelect.value : 2, 10) || 2;
      const startTime = this.startTimeSelect.value || '09:00';
      const [h, m] = startTime.split(':').map(Number);
      const endH = h + durationHours;
      const endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      const cabinPaymentMethod = document.getElementById('pay-cabin-cash').checked ? 'Cash' : 'Card';

      const getSnackData = (key) => {
        const qtyEl = document.getElementById(`snack-qty-${key}`);
        const qty = qtyEl ? parseInt(qtyEl.textContent, 10) || 0 : 0;
        const payEl = document.querySelector(`input[name="pay-snack-${key}"]:checked`);
        const paymentMethod = payEl ? payEl.value : 'Cash';
        return { qty, paymentMethod };
      };

      const existingBooking = this.activeBookingId ? this.dataStore.getBookingById(this.activeBookingId) : null;

      let paymentStatus = existingBooking ? (existingBooking.paymentStatus || 'full') : 'full';
      let advancePaidAmount = existingBooking ? (existingBooking.advancePaidAmount || 0) : 0;
      let balanceDueAmount = existingBooking ? (existingBooking.balanceDueAmount || 0) : 0;
      let balanceSettled = existingBooking ? (existingBooking.balanceSettled !== undefined ? existingBooking.balanceSettled : true) : true;
      let balancePaymentMethod = existingBooking ? (existingBooking.balancePaymentMethod || 'Cash') : 'Cash';
      let balanceSettledAt = existingBooking ? existingBooking.balanceSettledAt : null;
      let balanceSettledAmount = existingBooking ? existingBooking.balanceSettledAmount : null;

      if (existingBooking && existingBooking.source === 'online') {
        const selectedOnlineStatus = document.querySelector('input[name="edit-online-payment-status"]:checked');
        paymentStatus = selectedOnlineStatus ? selectedOnlineStatus.value : (existingBooking.paymentStatus || 'advance');

        const extraGuests = Math.max(0, guestCount - (PRICING.baseGuests || 4));
        const extraHours = Math.max(0, durationHours - PRICING.baseHours);
        const cabinExtraAmount = extraHours * (PRICING.extraHourRate || 1000);
        const extraGuestsAmount = extraGuests * (PRICING.extraGuestRate || 800);
        const totalCabinAmount = (PRICING.baseRate || 2500) + cabinExtraAmount + extraGuestsAmount;

        if (paymentStatus === 'advance') {
          advancePaidAmount = PRICING.onlineAdvance || 1000;
          balanceDueAmount = (PRICING.onlineBalance || 1500) + cabinExtraAmount + extraGuestsAmount;
          if (existingBooking.paymentStatus === 'advance') {
            balanceSettled = !!existingBooking.balanceSettled;
            balanceSettledAt = existingBooking.balanceSettledAt;
            balanceSettledAmount = existingBooking.balanceSettled ? balanceDueAmount : null;
          } else {
            balanceSettled = false;
            balanceSettledAt = null;
            balanceSettledAmount = null;
          }
        } else {
          // Full payment online
          advancePaidAmount = totalCabinAmount;
          balanceDueAmount = 0;
          balanceSettled = true;
          balanceSettledAt = null;
          balanceSettledAmount = null;
        }
      }

      return {
        id: this.bookingIdInput.value || `bkg_${Date.now()}`,
        cabinId: this.cabinSelect.value,
        customerName: this.customerNameInput.value.trim(),
        nic1: this.nic1Input.value.trim(),
        nic2: this.nic2Input.value.trim(),
        phone: this.phoneInput.value.trim(),
        guestCount,
        date: existingBooking ? existingBooking.date : (this.timelineGrid ? this.timelineGrid.options.currentDate : '2026-08-23'),
        startTime,
        durationHours,
        endTime,
        cabinPaymentMethod: (existingBooking && existingBooking.source === 'online') ? existingBooking.cabinPaymentMethod : cabinPaymentMethod,
        snacks: {
          chips: getSnackData('chips'),
          waterSmall: getSnackData('waterSmall'),
          waterLarge: getSnackData('waterLarge'),
          popcorn: getSnackData('popcorn'),
          softDrink: getSnackData('softDrink')
        },
        notes: this.notesInput.value.trim(),
        status: existingBooking ? existingBooking.status : 'confirmed',
        source: existingBooking ? existingBooking.source : 'direct',
        paymentStatus,
        advancePaidAmount,
        balanceDueAmount,
        balanceSettled,
        balancePaymentMethod,
        balanceSettledAt,
        balanceSettledAmount,
        createdAt: existingBooking ? existingBooking.createdAt : new Date().toISOString()
      };
    }

    updateLiveTotals() {
      const formData = this.getFormData();
      const calc = Calculator.calculateBookingTotal(formData);

      const baseEl = document.getElementById('summary-base-rate');
      const extraGuestsRow = document.getElementById('summary-extra-guests-row');
      const extraGuestsRate = document.getElementById('summary-extra-guests-rate');
      const extraHoursRow = document.getElementById('summary-extra-hours-row');
      const extraEl = document.getElementById('summary-extra-rate');
      const snacksEl = document.getElementById('summary-snacks-total');
      const cashEl = document.getElementById('summary-cash-total');
      const cardEl = document.getElementById('summary-card-total');
      const grandEl = document.getElementById('summary-grand-total');

      if (baseEl) baseEl.textContent = Calculator.formatCurrency(calc.cabinBaseAmount);

      // Dynamic Pricing for Extra Guests (5+ guests)
      if (extraGuestsRow && extraGuestsRate) {
        if (calc.extraGuests > 0) {
          extraGuestsRate.textContent = `+${Calculator.formatCurrency(calc.extraGuestsAmount)} (${calc.extraGuests} extra @ Rs. 800)`;
          extraGuestsRow.classList.remove('hidden');
        } else {
          extraGuestsRow.classList.add('hidden');
        }
      }

      // Extra Hours
      if (extraHoursRow && extraEl) {
        if (calc.extraHours > 0) {
          extraEl.textContent = `+${Calculator.formatCurrency(calc.cabinExtraAmount)} (${calc.extraHours}h @ Rs. 1,000/hr)`;
          extraHoursRow.classList.remove('hidden');
        } else {
          extraHoursRow.classList.add('hidden');
        }
      }

      if (snacksEl) snacksEl.textContent = Calculator.formatCurrency(calc.beverageTotalAmount);
      if (cashEl) cashEl.textContent = Calculator.formatCurrency(calc.totalCash);
      if (cardEl) cardEl.textContent = Calculator.formatCurrency(calc.totalCard);
      if (grandEl) grandEl.textContent = Calculator.formatCurrency(calc.grandTotal);
    }

    checkForConflicts() {
      const cabinId = this.cabinSelect.value;
      const startTime = this.startTimeSelect.value;
      const duration = parseInt(this.durationSelect.value, 10) || 3;
      const [h, m] = startTime.split(':').map(Number);
      const endMinutes = (h + duration) * 60 + m;
      const startMinutes = h * 60 + m;

      const currentBookingId = this.bookingIdInput.value;
      const bookings = this.dataStore.getAllBookings();
      const existingBooking = this.dataStore.getBookingById(currentBookingId);
      const bookingDate = existingBooking ? existingBooking.date : (this.timelineGrid ? this.timelineGrid.options.currentDate : null);

      const conflicts = bookings.filter(b => {
        if (b.id === currentBookingId) return false;
        if (b.cabinId !== cabinId || b.date !== bookingDate) return false;
        if (b.status === 'completed') return false;

        const [bStartH, bStartM] = b.startTime.split(':').map(Number);
        const [bEndH, bEndM] = b.endTime.split(':').map(Number);
        const bStart = bStartH * 60 + bStartM;
        const bEnd = bEndH * 60 + bEndM;

        return startMinutes < bEnd && endMinutes > bStart;
      });

      if (conflicts.length > 0) {
        const conf = conflicts[0];
        this.conflictAlert.classList.remove('hidden');
        this.conflictAlert.innerHTML = `⚠️ <strong>Time Conflict:</strong> Overlaps with booking for <strong>${conf.customerName}</strong> (${this.timelineGrid.formatTime12h(conf.startTime)} - ${this.timelineGrid.formatTime12h(conf.endTime)}).`;
      } else {
        this.conflictAlert.classList.add('hidden');
      }
    }

    openDirectBookingModal(prefill = {}) {
      this.isEditMode = false;
      this.activeBookingId = null;
      this.bookingModalTitle.textContent = 'New Direct Booking';
      this.bookingIdInput.value = `bkg_${Date.now()}`;

      if (this.deleteBtn) this.deleteBtn.classList.add('hidden');
      if (this.earlyCheckoutBtn) this.earlyCheckoutBtn.classList.add('hidden');
      if (this.acceptCheckinBtn) this.acceptCheckinBtn.classList.add('hidden');
      if (this.onlineSettlementSection) this.onlineSettlementSection.classList.add('hidden');

      this.customerNameInput.value = prefill.customerName || '';
      this.nic1Input.value = prefill.nic1 || '';
      this.nic2Input.value = prefill.nic2 || '';
      this.phoneInput.value = prefill.phone || '';
      this.notesInput.value = prefill.notes || '';

      // Set Number of People (Default 2)
      if (this.guestSelect) {
        this.guestSelect.value = prefill.guestCount ? String(prefill.guestCount) : '2';
      }

      if (prefill.cabinId) {
        this.cabinSelect.value = prefill.cabinId;
      } else {
        this.cabinSelect.selectedIndex = 0;
      }

      if (prefill.slotTime) {
        const [h] = prefill.slotTime.split(':').map(Number);
        if (h <= 21) {
          this.startTimeSelect.value = prefill.slotTime;
        } else {
          this.startTimeSelect.value = '21:00';
        }
      } else {
        this.startTimeSelect.value = '14:00';
      }

      this.durationSelect.value = '3';
      this.cabinPaymentCashRadio.checked = true;

      ['chips', 'waterSmall', 'waterLarge', 'popcorn', 'softDrink'].forEach(key => {
        const qtyEl = document.getElementById(`snack-qty-${key}`);
        if (qtyEl) qtyEl.textContent = '0';
        const cashRadio = document.getElementById(`pay-snack-${key}-cash`);
        if (cashRadio) cashRadio.checked = true;
      });

      this.updateCalculatedEndTime();
      this.updateLiveTotals();
      this.checkForConflicts();

      this.bookingModal.classList.remove('hidden');
    }

    openEditBookingModal(bookingId) {
      const booking = this.dataStore.getBookingById(bookingId);
      if (!booking) return;

      this.isEditMode = true;
      this.activeBookingId = bookingId;
      this.bookingModalTitle.textContent = `Edit Booking - ${booking.customerName}`;
      this.bookingIdInput.value = booking.id;

      if (this.deleteBtn) this.deleteBtn.classList.remove('hidden');

      // Show Accept & Check-In button if booking is a pending online request
      if (this.acceptCheckinBtn) {
        if (booking.source === 'online' && booking.status === 'pending') {
          this.acceptCheckinBtn.classList.remove('hidden');
        } else {
          this.acceptCheckinBtn.classList.add('hidden');
        }
      }

      // Show Early Checkout only for currently active bookings (happening right now, today)
      if (this.earlyCheckoutBtn) {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const isCurrentlyActive = this.timelineGrid
          ? this.timelineGrid.isBookingActive(booking, now.getHours(), now.getMinutes(), todayStr)
          : false;
        if (isCurrentlyActive) {
          this.earlyCheckoutBtn.classList.remove('hidden');
        } else {
          this.earlyCheckoutBtn.classList.add('hidden');
        }
      }

      this.cabinSelect.value = booking.cabinId;
      this.customerNameInput.value = booking.customerName;
      this.nic1Input.value = booking.nic1 || '';
      this.nic2Input.value = booking.nic2 || '';
      this.phoneInput.value = booking.phone || '';
      
      // Populate guest count (default 2)
      if (this.guestSelect) {
        this.guestSelect.value = String(booking.guestCount || 2);
      }

      this.startTimeSelect.value = booking.startTime;
      this.durationSelect.value = String(booking.durationHours || 3);
      this.notesInput.value = booking.notes || '';

      if (booking.cabinPaymentMethod === 'Card') {
        this.cabinPaymentCardRadio.checked = true;
      } else {
        this.cabinPaymentCashRadio.checked = true;
      }

      // Online Booking Settlement Handling in Edit Modal
      if (this.onlineSettlementSection) {
        if (booking.source === 'online') {
          this.onlineSettlementSection.classList.remove('hidden');
          const isAdvance = booking.paymentStatus === 'advance';

          const advanceRadio = document.getElementById('edit-online-pay-advance');
          const fullRadio = document.getElementById('edit-online-pay-full');
          if (advanceRadio && fullRadio) {
            advanceRadio.checked = isAdvance;
            fullRadio.checked = !isAdvance;
          }

          this.renderEditOnlineSettlementContent(booking, booking.paymentStatus);
        } else {
          this.onlineSettlementSection.classList.add('hidden');
        }
      }

      ['chips', 'waterSmall', 'waterLarge', 'popcorn', 'softDrink'].forEach(key => {
        const item = booking.snacks ? booking.snacks[key] : null;
        const qtyEl = document.getElementById(`snack-qty-${key}`);
        if (qtyEl) qtyEl.textContent = item ? item.qty || 0 : '0';

        const cashRadio = document.getElementById(`pay-snack-${key}-cash`);
        const cardRadio = document.getElementById(`pay-snack-${key}-card`);
        if (item && item.paymentMethod === 'Card') {
          if (cardRadio) cardRadio.checked = true;
        } else {
          if (cashRadio) cashRadio.checked = true;
        }
      });

      this.updateCalculatedEndTime();
      this.updateLiveTotals();
      this.checkForConflicts();

      this.bookingModal.classList.remove('hidden');
    }

    renderEditOnlineSettlementContent(booking, currentStatus = null) {
      if (!this.onlineSettlementContent) return;
      const status = currentStatus || booking.paymentStatus || 'advance';
      const isAdvance = status === 'advance';

      const calc = Calculator.calculateBookingTotal(booking);
      const balanceDue = calc.balanceDueAmount;
      const balanceFormatted = Calculator.formatCurrency(balanceDue);

      if (this.onlineStatusBadge) {
        this.onlineStatusBadge.textContent = isAdvance ? 'Advance Paid (Online)' : 'Full Payment (Online)';
        this.onlineStatusBadge.className = isAdvance
          ? 'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30'
          : 'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      }

      if (isAdvance) {
        if (booking.balanceSettled && booking.paymentStatus === 'advance') {
          const isCash = (booking.balancePaymentMethod || 'Cash') === 'Cash';
          this.onlineSettlementContent.innerHTML = `
            <div class="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-bold flex items-center gap-1">✓ Balance Settled at Venue (${balanceFormatted} via ${booking.balancePaymentMethod || 'Cash'})</div>
                  <div class="text-[11px] text-emerald-300/80">Online Advance: Rs. 1,000 (Excluded from Daily Till) • Daily Sales Logged: <strong class="text-white font-mono">+${balanceFormatted} (${booking.balancePaymentMethod || 'Cash'})</strong></div>
                </div>
                <span class="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">Settled</span>
              </div>
              <div class="pt-2 border-t border-emerald-500/30 flex items-center justify-between text-xs">
                <span class="text-[11px] text-slate-300">Payment Method:</span>
                <div class="flex items-center gap-2">
                  <div class="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-xs">
                    <label class="cursor-pointer">
                      <input type="radio" name="modal-bal-pay-${booking.id}" value="Cash" ${isCash ? 'checked' : ''} class="peer sr-only">
                      <span class="px-2.5 py-0.5 rounded text-slate-400 peer-checked:bg-emerald-600 peer-checked:text-white block font-bold">💵 Cash</span>
                    </label>
                    <label class="cursor-pointer">
                      <input type="radio" name="modal-bal-pay-${booking.id}" value="Card" ${!isCash ? 'checked' : ''} class="peer sr-only">
                      <span class="px-2.5 py-0.5 rounded text-slate-400 peer-checked:bg-cyan-600 peer-checked:text-white block font-bold">💳 Card</span>
                    </label>
                  </div>
                  <button type="button" id="btn-modal-update-balance-method" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 rounded-lg text-xs font-bold transition-all">
                    Update
                  </button>
                </div>
              </div>
            </div>
          `;

          const updateBalBtn = document.getElementById('btn-modal-update-balance-method');
          if (updateBalBtn) {
            updateBalBtn.addEventListener('click', () => {
              const methodEl = document.querySelector(`input[name="modal-bal-pay-${booking.id}"]:checked`);
              const method = methodEl ? methodEl.value : 'Cash';
              this.dataStore.settleOnlineBalance(booking.id, method);
              this.toast.success(`Settlement payment method updated to ${method} for ${booking.customerName}!`);
              this.openEditBookingModal(booking.id);
              this.timelineGrid.refresh();
              window.renderSidebarRequests && window.renderSidebarRequests();
            });
          }
        } else {
          this.onlineSettlementContent.innerHTML = `
            <div class="p-3 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-200 space-y-2.5">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-[11px] text-amber-300/80">Online Advance Paid: <strong class="font-mono text-slate-100">Rs. 1,000</strong> (Excluded)</div>
                  <div class="text-xs font-black text-amber-300 uppercase tracking-wide">Pending Balance: <span class="font-mono text-amber-400 font-bold">${balanceFormatted}</span></div>
                </div>
                <span class="text-[10px] font-bold bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded border border-amber-500/40">Due At Venue</span>
              </div>

              <div class="pt-2 border-t border-amber-500/30 flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-[11px] font-semibold text-slate-300">Payment Method:</span>
                  <div class="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-xs">
                    <label class="cursor-pointer">
                      <input type="radio" name="modal-bal-pay-${booking.id}" value="Cash" checked class="peer sr-only">
                      <span class="px-2.5 py-1 rounded text-slate-400 peer-checked:bg-emerald-600 peer-checked:text-white block font-bold">💵 Cash</span>
                    </label>
                    <label class="cursor-pointer">
                      <input type="radio" name="modal-bal-pay-${booking.id}" value="Card" class="peer sr-only">
                      <span class="px-2.5 py-1 rounded text-slate-400 peer-checked:bg-cyan-600 peer-checked:text-white block font-bold">💳 Card</span>
                    </label>
                  </div>
                </div>

                <button type="button" id="btn-modal-confirm-balance" class="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-1 transition-all">
                  <span>✓</span> Confirm Balance Paid (${balanceFormatted})
                </button>
              </div>
            </div>
          `;

          const confirmBalBtn = document.getElementById('btn-modal-confirm-balance');
          if (confirmBalBtn) {
            confirmBalBtn.addEventListener('click', () => {
              const methodEl = document.querySelector(`input[name="modal-bal-pay-${booking.id}"]:checked`);
              const method = methodEl ? methodEl.value : 'Cash';
              this.dataStore.settleOnlineBalance(booking.id, method);
              this.toast.success(`${balanceFormatted} balance marked as paid via ${method} for ${booking.customerName}!`);
              this.openEditBookingModal(booking.id);
              this.timelineGrid.refresh();
              window.renderSidebarRequests && window.renderSidebarRequests();
            });
          }
        }
      } else {
        // Full payment online
        this.onlineSettlementContent.innerHTML = `
          <div class="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-300">
            <div>
              <div class="font-bold text-emerald-400">✨ 100% Paid in Full Online (${Calculator.formatCurrency(calc.grandTotal)})</div>
              <div class="text-[11px] text-slate-400">No balance remaining • Excluded from front desk daily till</div>
            </div>
            <span class="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">Pre-paid</span>
          </div>
        `;
      }
    }

    handleSaveBooking() {
      const formData = this.getFormData();

      if (!formData.customerName) {
        this.toast.error('Please enter the customer name');
        this.customerNameInput.focus();
        return;
      }

      if (!formData.nic1) {
        this.toast.error('NIC 1 is required for front-desk security check');
        this.nic1Input.focus();
        return;
      }

      const assignedCabin = this.dataStore.getCabinById(formData.cabinId);
      const cabinName = assignedCabin ? assignedCabin.name : formData.cabinId;

      if (this.isEditMode) {
        this.dataStore.updateBooking(this.activeBookingId, formData);
        this.toast.success(`Booking for ${formData.customerName} (${formData.guestCount} guests) updated! Assigned to ${cabinName}`);
      } else {
        this.dataStore.addBooking(formData);
        this.toast.success(`Booking created for ${formData.customerName} (${formData.guestCount} guests)! Assigned to ${cabinName}`);
      }

      this.closeAllModals();
      this.timelineGrid.refresh();
      window.renderSidebarRequests && window.renderSidebarRequests();
    }

    handleDeleteBooking() {
      if (!this.activeBookingId) return;
      const bkg = this.dataStore.getBookingById(this.activeBookingId);
      const name = bkg ? bkg.customerName : 'this booking';
      if (confirm(`Are you sure you want to cancel / delete the booking for ${name}?`)) {
        this.dataStore.deleteBooking(this.activeBookingId);
        this.toast.info(`Booking for ${name} was removed.`);
        this.closeAllModals();
        this.timelineGrid.refresh();
        window.renderSidebarRequests && window.renderSidebarRequests();
      }
    }

    handleEarlyCheckout() {
      if (!this.activeBookingId) return;
      const bkg = this.dataStore.getBookingById(this.activeBookingId);
      if (!bkg) return;

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Only allow early checkout on bookings that are currently active (happening right now, today)
      const isCurrentlyActive = this.timelineGrid
        ? this.timelineGrid.isBookingActive(bkg, now.getHours(), now.getMinutes(), todayStr)
        : false;
      if (!isCurrentlyActive) {
        this.toast.warning('Early checkout is only available for currently active sessions.');
        return;
      }

      const nowH = String(now.getHours()).padStart(2, '0');
      const nowM = String(now.getMinutes()).padStart(2, '0');
      const nowTimeStr = `${nowH}:${nowM}`;

      const [startH, startM] = bkg.startTime.split(':').map(Number);
      const startTotalMin = startH * 60 + startM;
      const nowTotalMin = now.getHours() * 60 + now.getMinutes();

      // Guard: checkout time must be after start time
      if (nowTotalMin <= startTotalMin) {
        this.toast.warning('Current time is at or before the session start time. Cannot early checkout.');
        return;
      }

      const name = bkg.customerName;
      const cabin = this.dataStore.getCabinById(bkg.cabinId);
      const cabinName = cabin ? cabin.name : bkg.cabinId;

      if (confirm(`Mark "${name}" in ${cabinName} as checked out at ${nowH}:${nowM}?\n\nThis will free up the cabin immediately for new bookings.`)) {
        this.dataStore.updateBooking(this.activeBookingId, {
          endTime: nowTimeStr,
          status: 'completed'
        });
        this.toast.success(`${name} checked out of ${cabinName} at ${nowH}:${nowM}. Cabin is now free.`);
        this.closeAllModals();
        this.timelineGrid.refresh();
        window.renderSidebarRequests && window.renderSidebarRequests();
      }
    }

    openSalesReportModal() {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const dateInput = document.getElementById('report-date-input');
      if (dateInput) dateInput.value = todayStr;
      this.renderSalesReport(todayStr);
      this.salesReportModal.classList.remove('hidden');
    }

    renderSalesReport(dateStr) {
      const bookings = this.dataStore.getAllBookings();
      const report = Calculator.generateDailyReport(bookings, dateStr);

      const cashTotalEl = document.getElementById('report-total-cash');
      const cardTotalEl = document.getElementById('report-total-card');
      const grandTotalEl = document.getElementById('report-grand-total');

      if (cashTotalEl) {
        cashTotalEl.innerHTML = `
          <div class="text-2xl font-black text-emerald-400 font-mono">${Calculator.formatCurrency(report.totalCashRevenue)}</div>
          <div class="text-xs text-slate-400 mt-1 flex flex-col gap-0.5">
            <div class="flex justify-between">
              <span>Direct Cabin:</span>
              <span class="font-mono text-slate-200">${Calculator.formatCurrency(report.cabinCashTotal)}</span>
            </div>
            <div class="flex justify-between">
              <span>Settled Online:</span>
              <span class="font-mono text-emerald-400 font-bold">${Calculator.formatCurrency(report.onlineSettledCashTotal)}</span>
            </div>
            <div class="flex justify-between">
              <span>Snacks / Drinks:</span>
              <span class="font-mono text-slate-200">${Calculator.formatCurrency(report.beverageCashTotal)}</span>
            </div>
          </div>
        `;
      }

      if (cardTotalEl) {
        cardTotalEl.innerHTML = `
          <div class="text-2xl font-black text-cyan-400 font-mono">${Calculator.formatCurrency(report.totalCardRevenue)}</div>
          <div class="text-xs text-slate-400 mt-1 flex flex-col gap-0.5">
            <div class="flex justify-between">
              <span>Direct Cabin:</span>
              <span class="font-mono text-slate-200">${Calculator.formatCurrency(report.cabinCardTotal)}</span>
            </div>
            <div class="flex justify-between">
              <span>Settled Online:</span>
              <span class="font-mono text-cyan-400 font-bold">${Calculator.formatCurrency(report.onlineSettledCardTotal)}</span>
            </div>
            <div class="flex justify-between">
              <span>Snacks / Drinks:</span>
              <span class="font-mono text-slate-200">${Calculator.formatCurrency(report.beverageCardTotal)}</span>
            </div>
          </div>
        `;
      }

      if (grandTotalEl) {
        grandTotalEl.innerHTML = `
          <div class="text-3xl font-black text-amber-400 font-mono">${Calculator.formatCurrency(report.grandTotalRevenue)}</div>
          <div class="text-xs text-amber-200/80 mt-1 flex flex-col gap-0.5">
            <div>${report.bookingsCount} Valid Daily Bookings</div>
            <div class="text-[11px] text-slate-400 font-normal">Direct Cabin: ${Calculator.formatCurrency(report.cabinGrandTotal)} • Settled Balances: ${Calculator.formatCurrency(report.onlineSettledGrandTotal)}</div>
          </div>
        `;
      }

      // Online Bookings Audit & Breakdown Section
      const auditContainer = document.getElementById('report-online-audit-container');
      if (auditContainer) {
        auditContainer.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-sm shrink-0">
              📲
            </div>
            <div>
              <div class="font-bold text-slate-200">Online Transactions & Front Desk Till Reconciliation</div>
              <div class="text-[11px] text-slate-400">
                Online Full Payments (Rs. 2,500) and Advance Online (Rs. 1,000) are pre-paid digitally and <strong class="text-amber-300">excluded</strong> from the venue cash calculation.
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4 shrink-0 font-mono">
            <div class="text-right">
              <div class="text-[10px] text-slate-500 uppercase tracking-wider">Online Pre-Paid Excluded</div>
              <div class="font-bold text-slate-400">${Calculator.formatCurrency(report.totalOnlinePrepaidExcluded)}</div>
            </div>
            <div class="h-6 w-px bg-slate-800"></div>
            <div class="text-right">
              <div class="text-[10px] text-emerald-400 uppercase tracking-wider">Venue Balances Collected</div>
              <div class="font-bold text-emerald-400">${Calculator.formatCurrency(report.onlineSettledGrandTotal)}</div>
            </div>
          </div>
        `;
      }

      // Itemized Online Request Transactions Log Table
      const onlineTransactionsBody = document.getElementById('report-online-transactions-tbody');
      if (onlineTransactionsBody) {
        if (!report.onlineBookingsList || report.onlineBookingsList.length === 0) {
          onlineTransactionsBody.innerHTML = `
            <tr>
              <td colspan="7" class="py-6 text-center text-slate-500 italic text-xs">
                No online request bookings recorded for ${dateStr}.
              </td>
            </tr>
          `;
        } else {
          let rows = '';
          report.onlineBookingsList.forEach(bkg => {
            let statusBadge = '';
            let tillCashDisplay = '';
            let tillCardDisplay = '';
            let advanceDisplay = '';

            if (bkg.paymentStatus === 'full') {
              statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">✨ 100% Pre-Paid</span>';
              advanceDisplay = `<span class="font-mono text-slate-300">${Calculator.formatCurrency(bkg.excludedAmount)}</span> <span class="block text-[9px] text-amber-400 font-bold">🚫 Excluded (Rs. 0 Till)</span>`;
              tillCashDisplay = '<span class="font-mono text-slate-500">Rs. 0</span>';
              tillCardDisplay = '<span class="font-mono text-slate-500">Rs. 0</span>';
            } else {
              // Advance payment
              advanceDisplay = `<span class="font-mono text-slate-300">${Calculator.formatCurrency(bkg.onlineAdvancePaid || 1000)}</span> <span class="block text-[9px] text-amber-400 font-bold">🚫 Excluded (Rs. 0 Till)</span>`;
              if (bkg.balanceSettled) {
                if (bkg.balancePaymentMethod === 'Card') {
                  statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">✓ Settled (💳 Card)</span>';
                  tillCashDisplay = '<span class="font-mono text-slate-500">Rs. 0</span>';
                  tillCardDisplay = `<span class="font-mono font-bold text-cyan-400">+${Calculator.formatCurrency(bkg.tillImpactCard)}</span>`;
                } else {
                  statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">✓ Settled (💵 Cash)</span>';
                  tillCashDisplay = `<span class="font-mono font-bold text-emerald-400">+${Calculator.formatCurrency(bkg.tillImpactCash)}</span>`;
                  tillCardDisplay = '<span class="font-mono text-slate-500">Rs. 0</span>';
                }
              } else {
                statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">⏳ Pending Due</span>';
                tillCashDisplay = '<span class="font-mono text-slate-500">Rs. 0</span>';
                tillCardDisplay = '<span class="font-mono text-slate-500">Rs. 0</span>';
              }
            }

            const guestCountBadge = bkg.guestCount >= 5
              ? `<span class="text-[10px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-mono font-bold">👥 ${bkg.guestCount}</span>`
              : `<span class="text-[10px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded font-mono">👥 ${bkg.guestCount || 2}</span>`;

            rows += `
              <tr class="border-b border-slate-800 text-xs hover:bg-slate-800/30">
                <td class="py-2.5 px-3">
                  <div class="font-bold text-slate-100">${bkg.customerName}</div>
                  <div class="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span class="text-cyan-300 font-medium">${bkg.cabinName}</span>
                    <span class="text-slate-600">•</span>
                    <span class="font-mono text-slate-400">${bkg.phone || bkg.nic1 || ''}</span>
                    ${guestCountBadge}
                  </div>
                </td>
                <td class="py-2.5 px-3 font-mono text-slate-300">
                  <div>${this.timelineGrid.formatTime12h(bkg.startTime)} - ${this.timelineGrid.formatTime12h(bkg.endTime)}</div>
                  <div class="text-[10px] text-slate-500 font-sans">${bkg.durationHours} Hours Session</div>
                </td>
                <td class="py-2.5 px-3 text-right">
                  ${advanceDisplay}
                </td>
                <td class="py-2.5 px-3 text-right font-mono font-medium ${bkg.balanceDueAmount > 0 && !bkg.balanceSettled ? 'text-amber-400 font-bold' : 'text-slate-300'}">
                  ${Calculator.formatCurrency(bkg.balanceDueAmount)}
                </td>
                <td class="py-2.5 px-3 text-center">
                  ${statusBadge}
                </td>
                <td class="py-2.5 px-3 text-right">
                  ${tillCashDisplay}
                </td>
                <td class="py-2.5 px-3 text-right">
                  ${tillCardDisplay}
                </td>
              </tr>
            `;
          });
          onlineTransactionsBody.innerHTML = rows;
        }
      }

      const snacksTableBody = document.getElementById('report-snacks-tbody');
      if (snacksTableBody) {
        let rows = '';
        for (const [k, item] of Object.entries(report.itemizedSnacks)) {
          rows += `
            <tr class="border-b border-slate-800 text-xs hover:bg-slate-800/30">
              <td class="py-2.5 px-3 font-medium text-slate-200">${item.name}</td>
              <td class="py-2.5 px-3 font-mono text-slate-400 text-right">${Calculator.formatCurrency(item.unitPrice)}</td>
              <td class="py-2.5 px-3 font-mono font-bold text-center text-slate-100">${item.totalQty}</td>
              <td class="py-2.5 px-3 font-mono text-emerald-400 text-right">${item.cashQty} (${Calculator.formatCurrency(item.cashTotal)})</td>
              <td class="py-2.5 px-3 font-mono text-cyan-400 text-right">${item.cardQty} (${Calculator.formatCurrency(item.cardTotal)})</td>
              <td class="py-2.5 px-3 font-mono font-bold text-amber-400 text-right">${Calculator.formatCurrency(item.totalRevenue)}</td>
            </tr>
          `;
        }
        snacksTableBody.innerHTML = rows;
      }

      const cabinsGrid = document.getElementById('report-cabins-grid');
      if (cabinsGrid) {
        let cards = '';
        Object.entries(report.cabinStats).forEach(([cId, stat]) => {
          cards += `
            <div class="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50 flex flex-col justify-between">
              <div class="flex justify-between items-center text-xs">
                <span class="font-bold text-slate-200">${stat.name}</span>
                <span class="bg-slate-700/80 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-mono">${stat.bookingsCount} bkg</span>
              </div>
              <div class="mt-2 flex justify-between items-baseline">
                <span class="text-[11px] text-slate-400 font-mono">${stat.hoursBooked}h</span>
                <span class="font-bold font-mono text-emerald-400 text-xs">${Calculator.formatCurrency(stat.revenue)}</span>
              </div>
            </div>
          `;
        });
        cabinsGrid.innerHTML = cards;
      }
    }

    closeAllModals() {
      [this.bookingModal, this.onlineReqModal, this.salesReportModal, this.powerCutModal].forEach(modal => {
        if (modal) modal.classList.add('hidden');
      });
      this.activeBookingId = null;
      this.isEditMode = false;
    }
  }

  /* ==========================================================================
     7. MAIN APP CONTROLLER
     ========================================================================== */

  class App {
    constructor() {
      this.dataStore = new DataStore();
      this.toast = new ToastService();
      const now = new Date();
      this.simulatedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      this.initTimeline();
      this.initModals();
      this.initClock();
      this.initSidebarRequests();
      this.bindHeaderActions();
      this.bindKeyboardShortcuts();

      window.renderSidebarRequests = () => this.initSidebarRequests();
    }

    initTimeline() {
      const timelineContainer = document.getElementById('timeline-container');
      this.timeline = new TimelineGrid(timelineContainer, this.dataStore, {
        currentDate: this.simulatedDate,
        onBookingClick: (bookingId) => {
          this.modals.openEditBookingModal(bookingId);
        },
        onEmptySlotClick: ({ cabinId, slotTime }) => {
          this.modals.openDirectBookingModal({ cabinId, slotTime });
        }
      });
    }

    initModals() {
      this.modals = new ModalController(this.dataStore, this.timeline, this.toast);
    }

    initClock() {
      const timeEl = document.getElementById('digital-clock-time');
      const dateEl = document.getElementById('digital-clock-date');

      const updateClock = () => {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;

        if (timeEl) {
          timeEl.innerHTML = `
            <span>${String(displayHours).padStart(2, '0')}</span><span class="animate-pulse">:</span><span>${String(minutes).padStart(2, '0')}</span><span class="animate-pulse">:</span><span>${String(seconds).padStart(2, '0')}</span> <span class="text-xs text-amber-400 font-bold ml-1">${ampm}</span>
          `;
        }

        if (dateEl) {
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const dayName = days[now.getDay()];
          const monthName = months[now.getMonth()];
          const dayNum = now.getDate();
          const year = now.getFullYear();

          dateEl.textContent = `${dayName}, ${monthName} ${dayNum}, ${year}`;
        }

        if (this.timeline) {
          this.timeline.updateCurrentTimeIndicator(now);
        }
      };

      updateClock();
      setInterval(updateClock, 1000);
    }

    initSidebarRequests() {
      const listContainer = document.getElementById('online-requests-list');
      const countBadge = document.getElementById('online-requests-count');
      if (!listContainer) return;

      const pendingRequests = this.dataStore.getPendingOnlineRequests();

      if (countBadge) {
        countBadge.textContent = `${pendingRequests.length} Pending`;
        if (pendingRequests.length > 0) {
          countBadge.className = 'px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse';
        } else {
          countBadge.className = 'px-2 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700';
        }
      }

      if (pendingRequests.length === 0) {
        listContainer.innerHTML = `
          <div class="p-6 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
            <div class="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-xl">✓</div>
            <p class="text-sm font-medium">All online requests cleared!</p>
            <p class="text-xs text-slate-600">New customer bookings will appear here instantly.</p>
          </div>
        `;
        return;
      }

      let cardsHtml = '';
      pendingRequests.forEach(req => {
        const calc = Calculator.calculateBookingTotal(req);

        const cabinOptionsHtml = CABINS.map(c => 
          `<option value="${c.id}" ${c.id === req.cabinId ? 'selected' : ''}>${c.name} (${c.type})</option>`
        ).join('');

        const isAdvance = req.paymentStatus === 'advance';
        const isSettled = !!req.balanceSettled;

        const guestBadge = (req.guestCount && req.guestCount >= 5)
          ? `<span class="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono font-bold">👥 ${req.guestCount} Guests (+Rs. ${(req.guestCount - 4) * 800})</span>`
          : `<span class="text-[10px] bg-slate-900 text-slate-300 px-1.5 py-0.5 rounded font-mono">👥 ${req.guestCount || 2} Guests</span>`;

        const balanceFormatted = Calculator.formatCurrency(calc.balanceDueAmount);

        let paymentStatusBlock = '';
        if (isAdvance) {
          if (isSettled) {
            paymentStatusBlock = `
              <div class="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs">
                <div class="flex items-center justify-between">
                  <span class="font-bold flex items-center gap-1"><span>✓</span> Balance Settled</span>
                  <span class="font-mono text-[11px] font-bold text-emerald-300">${balanceFormatted} (${req.balancePaymentMethod || 'Cash'})</span>
                </div>
                <div class="text-[10px] text-emerald-400/80 mt-0.5">Advance Paid Online: Rs. 1,000</div>
              </div>
            `;
          } else {
            paymentStatusBlock = `
              <div class="p-2.5 rounded-lg bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs space-y-1">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-[10px] text-amber-300/80">Online Advance: <strong class="font-mono text-slate-100">Rs. 1,000</strong></div>
                    <div class="text-xs font-black text-amber-300 tracking-wide uppercase">Pending Balance: <span class="font-mono text-amber-400 font-black">${balanceFormatted}</span></div>
                  </div>
                  <span class="text-[9px] font-bold bg-amber-500/30 text-amber-200 px-1.5 py-0.5 rounded border border-amber-500/40 uppercase">Due Venue</span>
                </div>
                <div class="text-[10px] text-amber-300/60 pt-1 border-t border-amber-500/30">Settle this balance from the booking's Edit window once the customer pays at the venue.</div>
              </div>
            `;
          }
        } else {
          paymentStatusBlock = `
            <div class="p-2 rounded-lg bg-slate-900/90 border border-emerald-500/40 text-xs flex items-center justify-between">
              <div class="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span>✨</span> Full Payment Online (${Calculator.formatCurrency(calc.grandTotal)})
              </div>
              <span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">Bal: Rs. 0</span>
            </div>
          `;
        }

        cardsHtml += `
          <div class="online-request-card p-3.5 rounded-xl bg-slate-800/70 border border-amber-500/40 hover:border-amber-400/80 transition-all shadow-lg flex flex-col gap-2.5" data-req-id="${req.id}">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                  <span>${req.customerName}</span>
                </div>
                <div class="text-xs text-slate-400 font-mono">${req.phone}</div>
              </div>
              <div class="flex flex-col items-end gap-1">
                <span class="bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Soft Block
                </span>
                ${guestBadge}
              </div>
            </div>

            <!-- Staff Suite Assignment Dropdown -->
            <div class="bg-slate-900/80 p-2 rounded-lg border border-slate-700/80">
              <div class="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span class="font-semibold text-slate-300">Staff Assigned Suite:</span>
                <span class="font-mono text-slate-400">${this.timeline.formatTime12h(req.startTime)} - ${this.timeline.formatTime12h(req.endTime)}</span>
              </div>
              <select class="sidebar-cabin-select w-full bg-slate-800 border border-slate-700 focus:border-cyan-500 rounded-lg px-2 py-1 text-xs text-cyan-200 font-medium"
                      data-req-id="${req.id}">
                ${cabinOptionsHtml}
              </select>
            </div>

            <!-- Payment Status & Venue Balance Settlement UI -->
            ${paymentStatusBlock}

            <div class="flex justify-between items-center text-xs">
              <div class="text-slate-400 text-[11px]">
                <span>NIC: </span><span class="font-mono text-slate-300">${req.nic1 || 'N/A'}</span>
              </div>
              <div class="font-bold font-mono text-amber-400 text-sm">
                Total: ${Calculator.formatCurrency(calc.grandTotal)}
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700/60">
              <button type="button" class="btn-accept-request py-1.5 px-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-950/50 flex items-center justify-center gap-1 transition-all"
                      data-req-id="${req.id}">
                <span>✓</span> Accept / Check-In
              </button>
              <button type="button" class="btn-cancel-request py-1.5 px-2 bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-500/50 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all"
                      data-req-id="${req.id}">
                <span>✕</span> Cancel
              </button>
            </div>
          </div>
        `;
      });

      listContainer.innerHTML = cardsHtml;

      listContainer.querySelectorAll('.sidebar-cabin-select').forEach(selectEl => {
        selectEl.addEventListener('change', () => {
          const reqId = selectEl.getAttribute('data-req-id');
          const newCabinId = selectEl.value;
          this.dataStore.updateBooking(reqId, { cabinId: newCabinId });
          const cab = this.dataStore.getCabinById(newCabinId);
          const req = this.dataStore.getBookingById(reqId);
          const name = req ? req.customerName : 'Request';
          this.toast.info(`Request for ${name} reassigned to ${cab ? cab.name : newCabinId}`);
          this.timeline.refresh();
        });
      });

      listContainer.querySelectorAll('.btn-accept-request').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const reqId = btn.getAttribute('data-req-id');
          const card = btn.closest('.online-request-card') || btn.closest('.p-3.5');
          const selectEl = card ? card.querySelector('.sidebar-cabin-select') : null;
          const assignedCabinId = selectEl ? selectEl.value : null;

          this.handleAcceptRequest(reqId, assignedCabinId);
        });
      });

      listContainer.querySelectorAll('.btn-cancel-request').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const reqId = btn.getAttribute('data-req-id');
          this.handleCancelRequest(reqId);
        });
      });

      listContainer.querySelectorAll('.online-request-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input') || e.target.closest('label')) {
            return;
          }
          const reqId = card.getAttribute('data-req-id');
          if (reqId) {
            this.modals.openEditBookingModal(reqId);
          }
        });
      });
    }

    handleAcceptRequest(reqId, assignedCabinId = null) {
      const bkg = this.dataStore.getBookingById(reqId);
      if (!bkg) return;

      const accepted = this.dataStore.acceptOnlineRequest(reqId, assignedCabinId);
      if (accepted) {
        const cabin = this.dataStore.getCabinById(accepted.cabinId);
        const cabinName = cabin ? cabin.name : accepted.cabinId;
        this.toast.success(`Booking for ${accepted.customerName} confirmed & checked into ${cabinName}!`);
        this.timeline.refresh();
        this.initSidebarRequests();
      }
    }

    handleCancelRequest(reqId) {
      const bkg = this.dataStore.getBookingById(reqId);
      const name = bkg ? bkg.customerName : 'Online Request';
      if (confirm(`Are you sure you want to cancel the request for ${name}? The soft block will be removed.`)) {
        this.dataStore.deleteBooking(reqId);
        this.toast.warning(`Request for ${name} was cancelled.`);
        this.timeline.refresh();
        this.initSidebarRequests();
      }
    }

    bindHeaderActions() {
      const directBtn = document.getElementById('btn-direct-booking');
      if (directBtn) {
        directBtn.addEventListener('click', () => {
          this.modals.openDirectBookingModal();
        });
      }

      const onlineBtn = document.getElementById('btn-online-request');
      if (onlineBtn) {
        onlineBtn.addEventListener('click', () => {
          this.openNewOnlineRequestModal();
        });
      }

      const reportBtn = document.getElementById('btn-sales-report');
      if (reportBtn) {
        reportBtn.addEventListener('click', () => {
          this.modals.openSalesReportModal();
        });
      }

      const searchInput = document.getElementById('search-bookings-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.timeline.setSearchQuery(e.target.value.trim());
        });
      }

      const resetBtn = document.getElementById('btn-reset-demo');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (confirm('Clear all bookings? This cannot be undone.')) {
            this.dataStore.resetToDefault();
            this.timeline.refresh();
            this.initSidebarRequests();
            this.toast.info('All bookings cleared.');
          }
        });
      }

      const jumpNowBtn = document.getElementById('btn-jump-now');
      if (jumpNowBtn) {
        jumpNowBtn.addEventListener('click', () => {
          const timelineScroll = document.getElementById('timeline-scroll-container');
          const indicator = document.getElementById('current-time-indicator');
          if (timelineScroll && indicator) {
            const indicatorPos = indicator.offsetLeft;
            timelineScroll.scrollTo({
              left: Math.max(0, indicatorPos - 300),
              behavior: 'smooth'
            });
            this.toast.info('Jumped to current time view.');
          }
        });
      }

    }

    openNewOnlineRequestModal() {
      const modal = document.getElementById('online-request-modal');
      if (!modal) return;

      // Reset form input fields
      const nameInput = document.getElementById('online-customer-name');
      const nic1Input = document.getElementById('online-nic1');
      const nic2Input = document.getElementById('online-nic2');
      const phoneInput = document.getElementById('online-phone');
      const notesInput = document.getElementById('online-notes');
      if (nameInput) nameInput.value = '';
      if (nic1Input) nic1Input.value = '';
      if (nic2Input) nic2Input.value = '';
      if (phoneInput) phoneInput.value = '';
      if (notesInput) notesInput.value = '';

      const cabinSelect = document.getElementById('online-cabin-select');
      if (cabinSelect) {
        cabinSelect.innerHTML = CABINS.map(c => 
          `<option value="${c.id}">${c.name} (${c.type})</option>`
        ).join('');
      }

      const guestSelect = document.getElementById('online-guests');
      if (guestSelect) {
        guestSelect.value = '2';
      }

      const durationSelect = document.getElementById('online-duration');
      if (durationSelect) {
        durationSelect.value = '3';
      }

      const advanceRadio = document.getElementById('online-pay-advance');
      const fullRadio = document.getElementById('online-pay-full');
      if (advanceRadio) advanceRadio.checked = true;

      const indicatorEl = document.getElementById('online-payment-indicator');

      const updateOnlineIndicator = () => {
        const guestCount = parseInt(guestSelect ? guestSelect.value : '2', 10) || 2;
        const duration = parseInt(durationSelect ? durationSelect.value : '3', 10) || 3;
        const isAdvance = advanceRadio && advanceRadio.checked;

        const extraHours = Math.max(0, duration - PRICING.baseHours);
        const extraGuests = Math.max(0, guestCount - (PRICING.baseGuests || 4));
        const extraHoursAmount = extraHours * (PRICING.extraHourRate || 1000);
        const extraGuestsAmount = extraGuests * (PRICING.extraGuestRate || 800);
        const totalCabinAmount = (PRICING.baseRate || 2500) + extraHoursAmount + extraGuestsAmount;
        const pendingBalance = isAdvance ? ((PRICING.onlineBalance || 1500) + extraHoursAmount + extraGuestsAmount) : 0;

        let breakdownParts = [];
        if (extraHours > 0) {
          breakdownParts.push(`+Rs. ${extraHoursAmount.toLocaleString()} (${extraHours} Extra Hr${extraHours > 1 ? 's' : ''})`);
        }
        if (extraGuests > 0) {
          breakdownParts.push(`+Rs. ${extraGuestsAmount.toLocaleString()} (${extraGuests} Extra Guest${extraGuests > 1 ? 's' : ''})`);
        }
        const breakdownHtml = breakdownParts.length > 0
          ? `<div class="text-[10px] text-amber-300/90 font-mono mt-0.5">${breakdownParts.join(' • ')}</div>`
          : '';

        if (indicatorEl) {
          if (isAdvance) {
            indicatorEl.className = 'p-2.5 rounded-lg bg-amber-950/70 border border-amber-500/50 text-amber-200 flex items-center justify-between';
            indicatorEl.innerHTML = `
              <div class="flex items-center gap-2">
                <span class="text-base">⏳</span>
                <div>
                  <div class="text-[11px] text-amber-300/80 font-medium">Advance Paid Online: <span class="font-mono font-bold text-slate-100">Rs. ${(PRICING.onlineAdvance || 1000).toLocaleString()}</span></div>
                  <div class="text-xs font-black text-amber-300 tracking-wide uppercase">Pending Balance: <span class="font-mono text-amber-400 font-bold">Rs. ${pendingBalance.toLocaleString()}</span></div>
                  ${breakdownHtml}
                </div>
              </div>
              <span class="text-[10px] font-bold px-2 py-0.5 bg-amber-500/30 text-amber-200 rounded border border-amber-400/40 uppercase tracking-wider">
                Due At Venue
              </span>
            `;
          } else {
            indicatorEl.className = 'p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 flex items-center justify-between';
            indicatorEl.innerHTML = `
              <div class="flex items-center gap-2">
                <span class="text-base">✨</span>
                <div>
                  <div class="text-[11px] text-emerald-300/80 font-medium">Full Amount Paid Online: <span class="font-mono font-bold text-slate-100">Rs. ${totalCabinAmount.toLocaleString()}</span></div>
                  <div class="text-xs font-black text-emerald-300 tracking-wide uppercase">Pending Balance: <span class="font-mono text-emerald-400">Rs. 0</span></div>
                  ${breakdownParts.length > 0 ? `<div class="text-[10px] text-emerald-300/90 font-mono mt-0.5">${breakdownParts.join(' • ')}</div>` : ''}
                </div>
              </div>
              <span class="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/30 text-emerald-200 rounded border border-emerald-400/40 uppercase tracking-wider">
                100% Pre-Paid
              </span>
            `;
          }
        }
      };

      document.querySelectorAll('input[name="online-payment-status"]').forEach(r => {
        r.onchange = updateOnlineIndicator;
      });
      if (guestSelect) {
        guestSelect.onchange = updateOnlineIndicator;
        guestSelect.oninput = updateOnlineIndicator;
      }
      if (durationSelect) {
        durationSelect.onchange = updateOnlineIndicator;
        durationSelect.oninput = updateOnlineIndicator;
      }

      updateOnlineIndicator();

      const timeSelect = document.getElementById('online-start-time');
      if (timeSelect) {
        let optionsHtml = '';
        for (let h = 9; h <= 21; h++) {
          for (let m of [0, 30]) {
            if (h === 21 && m === 30) continue;
            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            const formatted = this.timeline.formatTime12h(timeStr);
            optionsHtml += `<option value="${timeStr}">${formatted}</option>`;
          }
        }
        timeSelect.innerHTML = optionsHtml;
      }

      const form = document.getElementById('online-request-form');
      if (form) {
        form.onsubmit = (e) => {
          e.preventDefault();
          const customerName = document.getElementById('online-customer-name').value.trim();
          const nic1 = document.getElementById('online-nic1').value.trim();
          const phone = document.getElementById('online-phone').value.trim();
          const guestCount = parseInt(document.getElementById('online-guests').value, 10) || 2;
          const cabinId = cabinSelect.value;
          const startTime = timeSelect.value;
          const duration = parseInt(document.getElementById('online-duration').value, 10) || 3;
          const paymentStatus = document.querySelector('input[name="online-payment-status"]:checked').value || 'advance';
          const notes = document.getElementById('online-notes').value.trim();

          if (!customerName || !nic1) {
            this.toast.error('Customer name and primary NIC are required');
            return;
          }

          const [h, m] = startTime.split(':').map(Number);
          const endTime = `${String(h + duration).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

          const isAdvance = paymentStatus === 'advance';
          const extraHours = Math.max(0, duration - PRICING.baseHours);
          const extraGuests = Math.max(0, guestCount - (PRICING.baseGuests || 4));
          const extraHoursAmount = extraHours * (PRICING.extraHourRate || 1000);
          const extraGuestsAmount = extraGuests * (PRICING.extraGuestRate || 800);
          const totalCabinAmount = (PRICING.baseRate || 2500) + extraHoursAmount + extraGuestsAmount;

          const balanceDue = isAdvance ? ((PRICING.onlineBalance || 1500) + extraHoursAmount + extraGuestsAmount) : 0;
          const advancePaid = isAdvance ? (PRICING.onlineAdvance || 1000) : totalCabinAmount;

          const newReq = {
            id: `onl_${Date.now()}`,
            cabinId,
            customerName,
            nic1,
            nic2: document.getElementById('online-nic2').value.trim(),
            phone,
            guestCount,
            date: this.simulatedDate || '2026-08-23',
            startTime,
            durationHours: duration,
            endTime,
            paymentStatus,
            advancePaidAmount: advancePaid,
            balanceDueAmount: balanceDue,
            balanceSettled: !isAdvance,
            balancePaymentMethod: 'Cash',
            cabinPaymentMethod: isAdvance ? 'Advance' : 'Online',
            snacks: {
              chips: { qty: 0, paymentMethod: 'Cash' },
              waterSmall: { qty: 0, paymentMethod: 'Cash' },
              waterLarge: { qty: 0, paymentMethod: 'Cash' },
              popcorn: { qty: 0, paymentMethod: 'Cash' },
              softDrink: { qty: 0, paymentMethod: 'Cash' }
            },
            notes: notes || 'Online App Reservation',
            status: 'pending',
            source: 'online',
            createdAt: new Date().toISOString()
          };

          this.dataStore.addBooking(newReq);
          const assignedCabin = this.dataStore.getCabinById(cabinId);
          const cabinName = assignedCabin ? assignedCabin.name : cabinId;
          const balanceMsg = isAdvance ? `Pending Bal: Rs. ${balanceDue.toLocaleString()}` : 'Full Payment Paid Online';
          this.toast.success(`Online Request created for ${customerName} (${guestCount} people, ${duration} hrs, ${balanceMsg})!`);
          modal.classList.add('hidden');
          this.timeline.refresh();
          this.initSidebarRequests();
        };
      }

      modal.classList.remove('hidden');
    }

    bindKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
          if (e.key === 'Escape') {
            this.modals.closeAllModals();
          }
          return;
        }

        if (e.key === 'Escape') {
          this.modals.closeAllModals();
        } else if (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'd') {
          e.preventDefault();
          this.modals.openDirectBookingModal();
        } else if (e.key.toLowerCase() === 'o') {
          e.preventDefault();
          this.openNewOnlineRequestModal();
        } else if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          this.modals.openSalesReportModal();
        }
      });
    }
  }

  // Initialize application on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    window.flickApp = new App();
  });

})();
