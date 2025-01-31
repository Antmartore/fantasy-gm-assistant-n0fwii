//
// Extensions.swift
// FantasyGMAssistant
//
// Swift extensions providing additional functionality to standard types and custom classes
// Version: 1.0.0
//

import Foundation // iOS 14.0+
import UIKit // iOS 14.0+

// MARK: - Date Extensions
extension Date {
    /// Converts date to ISO8601 formatted string
    /// - Returns: ISO8601 formatted date string
    func toISO8601String() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: self)
    }
    
    /// Checks if date is expired based on TTL
    /// - Parameter ttl: Time-to-live interval in seconds
    /// - Returns: True if date is expired
    func isExpired(ttl: TimeInterval) -> Bool {
        let expirationDate = self.addingTimeInterval(ttl)
        return Date().compare(expirationDate) == .orderedDescending
    }
}

// MARK: - String Extensions
extension String {
    /// Converts string to SportType enum
    /// - Returns: Optional sport type enum value
    func toSportType() -> SportType? {
        return SportType(rawValue: self.uppercased())
    }
    
    /// Truncates string to specified length with ellipsis
    /// - Parameter length: Maximum length of string
    /// - Returns: Truncated string
    func truncate(length: Int) -> String {
        guard self.count > length else { return self }
        let index = self.index(self.startIndex, offsetBy: length)
        return String(self[..<index]) + "..."
    }
    
    /// Returns localized version of string key
    /// - Parameter arguments: Optional dictionary of arguments for string formatting
    /// - Returns: Localized string with arguments
    func localized(arguments: [String: Any]? = nil) -> String {
        let localizedString = NSLocalizedString(self, comment: "")
        guard let args = arguments else { return localizedString }
        
        return String(format: localizedString, arguments: args.map { String(describing: $1) })
    }
}

// MARK: - Dictionary Extensions
extension Dictionary where Key == String {
    /// Converts dictionary to JSON string
    /// - Returns: Optional JSON string
    func jsonString() -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: self, options: .prettyPrinted) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }
    
    /// Formats error dictionary to user-friendly message
    /// - Returns: Formatted error message
    func errorMessage() -> String {
        let code = self["code"] as? String ?? "unknown_error"
        let message = self["message"] as? String ?? "An unknown error occurred"
        return "[\(code)] \(message)".localized()
    }
    
    /// Generates consistent cache key from dictionary
    /// - Returns: Cache key string
    func cacheKey() -> String {
        let sortedKeys = self.keys.sorted()
        let keyValuePairs = sortedKeys.map { "\($0)=\(self[$0] ?? "")" }
        let concatenatedString = keyValuePairs.joined(separator: "&")
        return concatenatedString.data(using: .utf8)?.base64EncodedString() ?? ""
    }
}

// MARK: - UIView Extensions
extension UIView {
    /// Adds standard shadow to view
    func addShadow() {
        self.layer.shadowColor = UIColor.black.cgColor
        self.layer.shadowOpacity = 0.2
        self.layer.shadowRadius = 4.0
        self.layer.shadowOffset = CGSize(width: 0, height: 2)
        self.layer.masksToBounds = false
        
        // Optimize shadow rendering with explicit path
        self.layer.shadowPath = UIBezierPath(roundedRect: self.bounds, 
                                           cornerRadius: self.layer.cornerRadius).cgPath
    }
    
    /// Applies standard corner radius to view
    func standardCornerRadius() {
        self.layer.cornerRadius = 8.0
        self.layer.masksToBounds = true
    }
    
    /// Returns standard spacing for layout
    /// - Parameter type: Type of spacing (enum value from UIConfig)
    /// - Returns: Spacing value
    func standardSpacing(type: SpacingType) -> CGFloat {
        let baseSpacing: CGFloat = 8.0
        
        switch type {
        case .compact:
            return baseSpacing * 0.5
        case .normal:
            return baseSpacing
        case .relaxed:
            return baseSpacing * 1.5
        case .wide:
            return baseSpacing * 2.0
        }
    }
}

// MARK: - Spacing Type Enumeration
enum SpacingType {
    case compact
    case normal
    case relaxed
    case wide
}