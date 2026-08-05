import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Trash2, Plus, Minus } from 'lucide-react-native';
import { THEME_COLORS } from '../theme';
import { sanitizeData } from '../services/api';
import { useTheme } from '../context/ThemeContext';

export default function CartItem({ item, onRemove, onIncrease, onDecrease }) {
  const { isDarkMode, theme } = useTheme();
  const discountedMRP = Math.round(item.price * 1.5);
  const discountPct = Math.round((1 - item.price / discountedMRP) * 100);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Top: image + details */}
      <View style={styles.top}>
        <Image source={{ uri: item.image }} style={[styles.img, { backgroundColor: theme.background }]} />
        <View style={styles.details}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{sanitizeData(item.name, 'Product')}</Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>{item.variant || 'Standard'}</Text>
          <View style={styles.ratingRow}>
            <Text style={[styles.ratingTxt, { color: isDarkMode ? '#10B981' : '#27AE60' }]}>4.8 ★</Text>
            <Text style={[styles.reviews, { color: theme.textSecondary }]}>(172 reviews)</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: theme.text }]}>
              {item.sqFt && item.sqFt !== '1' && item.sqFt !== 1 ? `₹${((parseFloat(item.price) || 0) * (parseFloat(item.sqFt) || 1)).toLocaleString()}` : `₹${item.price}`}
            </Text>
            <Text style={[styles.mrp, { color: theme.textSecondary }]}>₹{discountedMRP}</Text>
            <Text style={[styles.discount, { color: isDarkMode ? '#10B981' : '#27AE60' }]}>{discountPct}% off</Text>
          </View>
          {item.sqFt && item.sqFt !== '1' && item.sqFt !== 1 && (
             <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
               (₹{item.price}/sq.ft x {item.sqFt} sq.ft)
             </Text>
          )}
        </View>
      </View>

      {/* Bottom: remove + qty */}
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.removeBtn, { backgroundColor: isDarkMode ? '#451A1A' : '#FEF2F2' }]} 
          onPress={onRemove}
        >
          <Trash2 size={13} color={theme.error} />
          <Text style={[styles.removeTxt, { color: theme.error }]}>Remove</Text>
        </TouchableOpacity>
        <View style={[styles.qtyBox, { borderColor: theme.border }]}>
          <TouchableOpacity style={styles.qtyBtn} onPress={onDecrease}>
            <Minus size={13} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.qty, { color: theme.text }]}>{item.quantity}</Text>
          <TouchableOpacity style={styles.qtyBtn} onPress={onIncrease}>
            <Plus size={13} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  top: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  img: { width: 80, height: 80, borderRadius: 8 },
  details: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  meta: { fontSize: 11, marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  ratingTxt: { fontSize: 10, fontWeight: '700' },
  reviews: { fontSize: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  price: { fontSize: 15, fontWeight: '800' },
  mrp: { fontSize: 11, textDecorationLine: 'line-through' },
  discount: { fontSize: 11, fontWeight: '700' },

  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  removeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 6,
  },
  removeTxt: { fontSize: 12, fontWeight: '700' },
  qtyBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 6,
  },
  qtyBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  qty: { fontSize: 14, fontWeight: '700', minWidth: 20, textAlign: 'center' },
});
