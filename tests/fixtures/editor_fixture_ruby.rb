class ReportRow
  attr_reader :name, :value

  def initialize(name, value)
    @name = name
    @value = value
  end
end

rows = [ReportRow.new('alpha', 3), ReportRow.new('beta', 5)]
puts rows.map(&:name).join(', ')
